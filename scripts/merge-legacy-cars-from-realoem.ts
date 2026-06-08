import { PrismaClient } from "@prisma/client";

import {
  baseChassisCode,
  deriveChassisCodeFromGeneration,
  inferEngineFromModel,
  normaliseBody,
  realOemKnownFieldsMatch,
  realOemModelsMatch,
} from "../src/server/realoem/chassis";
import {
  canTreatXDriveAsImplicit,
  canUseOwnerApprovedBaseChassis,
  getOwnerDirectedDeleteReason,
} from "../src/server/realoem/legacy-rules";

type DbCar = {
  id: string;
  make: string;
  series: string;
  generation: string;
  chassisCode: string | null;
  model: string;
  body: string | null;
  engine: string | null;
  _count: {
    Donor: number;
    parts: number;
  };
};

type MergeAction = {
  legacy: DbCar;
  target: DbCar;
  reason: string;
};

type DeleteAction = {
  legacy: DbCar;
  reason: string;
};

type AmbiguousMatch = {
  legacy: DbCar;
  candidates: DbCar[];
  reason: string;
  bodies: string[];
  engines: string[];
};

type AliasCandidate = {
  legacy: DbCar;
  candidates: DbCar[];
  reason: string;
};

type BaseChassisCandidate = {
  legacy: DbCar;
  candidates: DbCar[];
  reason: string;
  exactChassisCode: string;
  baseChassisCode: string;
  bodies: string[];
  engines: string[];
};

type NoMatch = {
  legacy: DbCar;
  reason: string;
};

type DuplicateMergeTarget = {
  targetId: string;
  target: string;
  legacyRows: string[];
};

type DuplicateTargetConflict = {
  target: DbCar;
  mergeActions: MergeAction[];
  reason: string;
};

const db = new PrismaClient();
const isApply = process.argv.includes("--apply");

const isPlaceholderCar = (car: DbCar): boolean =>
  car.series === "PE000" || car.series === "SS000";

const existingChassisCode = (car: DbCar): string | null =>
  car.chassisCode ?? deriveChassisCodeFromGeneration(car.generation);

const existingBody = (car: DbCar): string | null => normaliseBody(car.body);

const effectiveEngine = (car: DbCar): string | null =>
  car.engine?.trim() || inferEngineFromModel(car.model);

const linkCount = (car: DbCar): number => car._count.Donor + car._count.parts;

const isLegacyIncomplete = (car: DbCar): boolean =>
  car.make === "BMW" &&
  !isPlaceholderCar(car) &&
  (car.chassisCode === null ||
    existingBody(car) === null ||
    car.engine === null ||
    car.engine.trim().length === 0);

const isEnriched = (car: DbCar): boolean =>
  car.make === "BMW" &&
  !isPlaceholderCar(car) &&
  car.chassisCode !== null &&
  existingBody(car) !== null &&
  car.engine !== null &&
  car.engine.trim().length > 0;

const knownFieldsMatch = (legacy: DbCar, candidate: DbCar): boolean => {
  const body = existingBody(candidate);
  const engine = candidate.engine?.trim();
  if (body === null || engine === undefined || engine.length === 0) {
    return false;
  }

  return realOemKnownFieldsMatch(
    {
      body: existingBody(legacy),
      engine: effectiveEngine(legacy),
    },
    {
      body,
      engine,
    },
  );
};

const legacyModelsMatch = (legacy: DbCar, candidate: DbCar): boolean =>
  realOemModelsMatch(legacy, candidate, {
    allowXDriveToPlain: canTreatXDriveAsImplicit(
      {
        chassisCode: existingChassisCode(legacy),
        series: legacy.series,
        model: legacy.model,
        body: existingBody(legacy),
      },
      {
        chassisCode: candidate.chassisCode,
        series: candidate.series,
        model: candidate.model,
        body: existingBody(candidate),
      },
    ),
  });

const uniqueValues = (values: Array<string | null>): string[] =>
  [
    ...new Set(values.filter((value): value is string => value !== null)),
  ].sort();

const formatCar = (car: DbCar): string =>
  [
    car.id,
    car.make,
    car.series,
    car.generation,
    existingChassisCode(car) ?? "<no-chassis>",
    car.model,
    existingBody(car) ?? "<no-body>",
    car.engine ?? "<no-engine>",
    `donors=${car._count.Donor}`,
    `parts=${car._count.parts}`,
  ].join(" ");

const findDuplicateMergeTargets = (
  actions: MergeAction[],
): DuplicateMergeTarget[] => {
  const byTargetId = new Map<string, MergeAction[]>();

  for (const action of actions) {
    const targetActions = byTargetId.get(action.target.id) ?? [];
    targetActions.push(action);
    byTargetId.set(action.target.id, targetActions);
  }

  return [...byTargetId.entries()]
    .filter(([, targetActions]) => targetActions.length > 1)
    .map(([targetId, targetActions]) => {
      const first = targetActions[0];
      if (first === undefined) {
        throw new Error("Unexpected missing merge action for target group");
      }

      return {
        targetId,
        target: formatCar(first.target),
        legacyRows: targetActions.map((action) => formatCar(action.legacy)),
      };
    });
};

const splitDuplicateTargetConflicts = (
  actions: MergeAction[],
): {
  safeMergeActions: MergeAction[];
  duplicateTargetConflicts: DuplicateTargetConflict[];
} => {
  const byTargetId = new Map<string, MergeAction[]>();

  for (const action of actions) {
    const targetActions = byTargetId.get(action.target.id) ?? [];
    targetActions.push(action);
    byTargetId.set(action.target.id, targetActions);
  }

  const duplicateTargetIds = new Set(
    [...byTargetId.entries()]
      .filter(([, targetActions]) => targetActions.length > 1)
      .map(([targetId]) => targetId),
  );

  const safeMergeActions = actions.filter(
    (action) => !duplicateTargetIds.has(action.target.id),
  );

  const duplicateTargetConflicts = [...byTargetId.values()]
    .filter((targetActions) => targetActions.length > 1)
    .map((targetActions) => {
      const first = targetActions[0];
      if (first === undefined) {
        throw new Error("Unexpected missing merge action for target group");
      }

      return {
        target: first.target,
        mergeActions: targetActions,
        reason:
          "Multiple legacy rows match the same RealOEM target; leaving for manual owner cleanup",
      };
    });

  return { safeMergeActions, duplicateTargetConflicts };
};

const findUnsafeOwnerDeletes = (actions: DeleteAction[]): DeleteAction[] =>
  actions.filter((action) => action.legacy._count.Donor > 0);

const classifyLegacyCar = (
  legacy: DbCar,
  enrichedCars: DbCar[],
): {
  merge?: MergeAction;
  deleteLegacy?: DeleteAction;
  ambiguous?: AmbiguousMatch;
  alias?: AliasCandidate;
  baseChassis?: BaseChassisCandidate;
  noMatch?: NoMatch;
} => {
  const chassisCode = existingChassisCode(legacy);
  if (chassisCode === null) {
    return {
      noMatch: {
        legacy,
        reason: "Could not derive chassis code from generation",
      },
    };
  }

  const deleteReason = getOwnerDirectedDeleteReason({
    chassisCode,
    series: legacy.series,
    model: legacy.model,
    body: existingBody(legacy),
  });
  if (deleteReason !== null) {
    return {
      deleteLegacy: {
        legacy,
        reason: deleteReason,
      },
    };
  }

  const buildMergeResult = (
    candidates: DbCar[],
    reason: string,
    ambiguousReason: string,
  ): {
    merge?: MergeAction;
    ambiguous?: AmbiguousMatch;
    alias?: AliasCandidate;
    baseChassis?: BaseChassisCandidate;
  } | null => {
    if (candidates.length === 0) return null;
    if (candidates.length === 1) {
      const target = candidates[0];
      if (target === undefined) {
        throw new Error("Unexpected missing target for single candidate match");
      }

      return {
        merge: {
          legacy,
          target,
          reason,
        },
      };
    }

    const bodies = uniqueValues(
      candidates.map((candidate) => existingBody(candidate)),
    );
    const engines = uniqueValues(
      candidates.map((candidate) => candidate.engine),
    );

    if (
      bodies.length === 1 &&
      engines.length === 1 &&
      candidates[0] !== undefined
    ) {
      return {
        merge: {
          legacy,
          target: candidates[0],
          reason: `${reason}; duplicate candidates share body/engine`,
        },
      };
    }

    return {
      ambiguous: {
        legacy,
        candidates,
        reason: ambiguousReason,
        bodies,
        engines,
      },
    };
  };

  const exactCandidates = enrichedCars.filter((candidate) => {
    if (candidate.id === legacy.id) return false;
    if (candidate.chassisCode !== chassisCode) return false;
    if (candidate.model !== legacy.model) return false;
    return knownFieldsMatch(legacy, candidate);
  });
  const exactResult = buildMergeResult(
    exactCandidates,
    "Unique exact chassis/model match with known fields respected",
    "Multiple exact RealOEM body/engine variants",
  );
  if (exactResult?.merge !== undefined) return { merge: exactResult.merge };
  if (exactResult?.ambiguous !== undefined) {
    return { ambiguous: exactResult.ambiguous };
  }

  const aliasCandidates = enrichedCars.filter((candidate) => {
    if (candidate.id === legacy.id) return false;
    if (candidate.chassisCode !== chassisCode) return false;
    if (!legacyModelsMatch(legacy, candidate)) return false;
    return knownFieldsMatch(legacy, candidate);
  });
  const aliasResult = buildMergeResult(
    aliasCandidates,
    "Unique owner-approved model alias; preserving existing car ID",
    "Multiple same-chassis RealOEM alias candidates",
  );
  if (aliasResult?.merge !== undefined) return { merge: aliasResult.merge };
  if (aliasResult?.ambiguous !== undefined) {
    return {
      alias: {
        legacy,
        candidates: aliasResult.ambiguous.candidates,
        reason: aliasResult.ambiguous.reason,
      },
    };
  }

  const ownerBaseCandidates = enrichedCars.filter((candidate) => {
    if (candidate.id === legacy.id) return false;
    if (
      !canUseOwnerApprovedBaseChassis(
        {
          chassisCode,
          series: legacy.series,
          model: legacy.model,
          body: existingBody(legacy),
        },
        {
          chassisCode: candidate.chassisCode,
          series: candidate.series,
          model: candidate.model,
          body: existingBody(candidate),
        },
      )
    ) {
      return false;
    }
    if (!legacyModelsMatch(legacy, candidate)) return false;
    return knownFieldsMatch(legacy, candidate);
  });
  const ownerBaseResult = buildMergeResult(
    ownerBaseCandidates,
    "Unique owner-approved base chassis match; preserving existing car ID",
    "Multiple owner-approved base chassis candidates",
  );
  if (ownerBaseResult?.merge !== undefined) {
    return { merge: ownerBaseResult.merge };
  }
  if (ownerBaseResult?.ambiguous !== undefined) {
    const baseChassis = baseChassisCode(chassisCode);
    return {
      baseChassis: {
        legacy,
        candidates: ownerBaseResult.ambiguous.candidates,
        reason: ownerBaseResult.ambiguous.reason,
        exactChassisCode: chassisCode,
        baseChassisCode: baseChassis,
        bodies: ownerBaseResult.ambiguous.bodies,
        engines: ownerBaseResult.ambiguous.engines,
      },
    };
  }

  const baseChassis = baseChassisCode(chassisCode);
  if (baseChassis !== chassisCode) {
    const baseReviewCandidates = enrichedCars.filter((candidate) => {
      if (candidate.id === legacy.id) return false;
      if (candidate.chassisCode !== baseChassis) return false;
      if (!legacyModelsMatch(legacy, candidate)) return false;
      return knownFieldsMatch(legacy, candidate);
    });

    if (baseReviewCandidates.length > 0) {
      return {
        baseChassis: {
          legacy,
          candidates: baseReviewCandidates,
          reason:
            "Base chassis candidates exist, but chassis is not owner-approved for automatic merge",
          exactChassisCode: chassisCode,
          baseChassisCode: baseChassis,
          bodies: uniqueValues(
            baseReviewCandidates.map((candidate) => existingBody(candidate)),
          ),
          engines: uniqueValues(
            baseReviewCandidates.map((candidate) => candidate.engine),
          ),
        },
      };
    }
  }

  return {
    noMatch: {
      legacy,
      reason: "No enriched RealOEM row matched chassis/model",
    },
  };
};

const applyMerge = async (action: MergeAction): Promise<void> => {
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      INSERT INTO partedeuro."_CarToPartDetail" ("A", "B")
      SELECT ${action.legacy.id}, j."B"
      FROM partedeuro."_CarToPartDetail" j
      WHERE j."A" = ${action.target.id}
      ON CONFLICT DO NOTHING
    `;

    await tx.$executeRaw`
      DELETE FROM partedeuro."_CarToPartDetail"
      WHERE "A" = ${action.target.id}
    `;

    await tx.donor.updateMany({
      where: { carId: action.target.id },
      data: { carId: action.legacy.id },
    });

    await tx.car.delete({
      where: { id: action.target.id },
    });

    await tx.car.update({
      where: { id: action.legacy.id },
      data: {
        series: action.target.series,
        generation: action.target.generation,
        chassisCode: action.target.chassisCode,
        model: action.target.model,
        body: existingBody(action.target),
        engine: action.target.engine,
      },
    });
  });
};

const applyDeleteLegacy = async (action: DeleteAction): Promise<void> => {
  if (action.legacy._count.Donor > 0) {
    throw new Error(
      `Refusing to delete ${action.legacy.id}; it still has donor links.`,
    );
  }

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`
      DELETE FROM partedeuro."_CarToPartDetail"
      WHERE "A" = ${action.legacy.id}
    `;

    await tx.car.delete({
      where: { id: action.legacy.id },
    });
  });
};

const run = async (): Promise<void> => {
  const cars = (await db.car.findMany({
    include: {
      _count: {
        select: {
          Donor: true,
          parts: true,
        },
      },
    },
    orderBy: [{ series: "asc" }, { generation: "asc" }, { model: "asc" }],
  })) as DbCar[];

  const legacyCars = cars.filter(isLegacyIncomplete);
  const enrichedCars = cars.filter(isEnriched);

  let mergeActions: MergeAction[] = [];
  const deleteLegacyActions: DeleteAction[] = [];
  const ambiguousMatches: AmbiguousMatch[] = [];
  const aliasCandidates: AliasCandidate[] = [];
  const baseChassisCandidates: BaseChassisCandidate[] = [];
  const noMatches: NoMatch[] = [];

  for (const legacy of legacyCars) {
    const classified = classifyLegacyCar(legacy, enrichedCars);
    if (classified.merge !== undefined) {
      mergeActions.push(classified.merge);
      continue;
    }
    if (classified.deleteLegacy !== undefined) {
      deleteLegacyActions.push(classified.deleteLegacy);
      continue;
    }
    if (classified.ambiguous !== undefined) {
      ambiguousMatches.push(classified.ambiguous);
      continue;
    }
    if (classified.alias !== undefined) {
      aliasCandidates.push(classified.alias);
      continue;
    }
    if (classified.baseChassis !== undefined) {
      baseChassisCandidates.push(classified.baseChassis);
      continue;
    }
    if (classified.noMatch !== undefined) {
      noMatches.push(classified.noMatch);
    }
  }

  const { safeMergeActions, duplicateTargetConflicts } =
    splitDuplicateTargetConflicts(mergeActions);
  mergeActions = safeMergeActions;

  const duplicateMergeTargets = findDuplicateMergeTargets(mergeActions);
  const unsafeOwnerDeletes = findUnsafeOwnerDeletes(deleteLegacyActions);

  const report = {
    mode: isApply ? "apply" : "dry",
    db: {
      cars: cars.length,
      legacyIncompleteBmwCars: legacyCars.length,
      enrichedBmwCars: enrichedCars.length,
    },
    plan: {
      mergePreservingLegacyIds: mergeActions.length,
      deleteOwnerDirectedLegacyRows: deleteLegacyActions.length,
      duplicateTargetConflicts: duplicateTargetConflicts.length,
      ambiguousMatches: ambiguousMatches.length,
      aliasCandidates: aliasCandidates.length,
      baseChassisCandidates: baseChassisCandidates.length,
      noMatches: noMatches.length,
    },
    linkedRows: {
      mergePreservingLegacyIds: {
        legacyDonorLinks: mergeActions.reduce(
          (count, action) => count + action.legacy._count.Donor,
          0,
        ),
        legacyPartLinks: mergeActions.reduce(
          (count, action) => count + action.legacy._count.parts,
          0,
        ),
        targetDonorLinks: mergeActions.reduce(
          (count, action) => count + action.target._count.Donor,
          0,
        ),
        targetPartLinks: mergeActions.reduce(
          (count, action) => count + action.target._count.parts,
          0,
        ),
      },
      deleteOwnerDirectedLegacyRows: {
        legacyDonorLinks: deleteLegacyActions.reduce(
          (count, action) => count + action.legacy._count.Donor,
          0,
        ),
        legacyPartLinks: deleteLegacyActions.reduce(
          (count, action) => count + action.legacy._count.parts,
          0,
        ),
      },
    },
    safety: {
      duplicateMergeTargetIds: duplicateMergeTargets.length,
      ownerDeletesWithDonors: unsafeOwnerDeletes.length,
    },
    samples: {
      duplicateMergeTargets: duplicateMergeTargets.slice(0, 10),
      unsafeOwnerDeletes: unsafeOwnerDeletes.slice(0, 10).map((action) => ({
        reason: action.reason,
        legacy: formatCar(action.legacy),
      })),
      duplicateTargetConflicts: duplicateTargetConflicts
        .slice(0, 30)
        .map((conflict) => ({
          reason: conflict.reason,
          target: formatCar(conflict.target),
          legacyRows: conflict.mergeActions.map((action) => ({
            reason: action.reason,
            legacy: formatCar(action.legacy),
          })),
        })),
      mergePreservingLegacyIds: mergeActions.slice(0, 40).map((action) => ({
        reason: action.reason,
        legacy: formatCar(action.legacy),
        target: formatCar(action.target),
      })),
      deleteOwnerDirectedLegacyRows: deleteLegacyActions
        .slice(0, 40)
        .map((action) => ({
          reason: action.reason,
          legacy: formatCar(action.legacy),
        })),
      ambiguousMatches: ambiguousMatches.slice(0, 30).map((match) => ({
        reason: match.reason,
        bodies: match.bodies,
        engines: match.engines,
        legacy: formatCar(match.legacy),
        candidates: match.candidates.slice(0, 12).map(formatCar),
      })),
      aliasCandidates: aliasCandidates.slice(0, 30).map((match) => ({
        reason: match.reason,
        legacy: formatCar(match.legacy),
        candidates: match.candidates.slice(0, 12).map(formatCar),
      })),
      baseChassisCandidates: baseChassisCandidates
        .slice(0, 50)
        .map((match) => ({
          reason: match.reason,
          exactChassisCode: match.exactChassisCode,
          baseChassisCode: match.baseChassisCode,
          bodies: match.bodies,
          engines: match.engines,
          legacy: formatCar(match.legacy),
          candidates: match.candidates.slice(0, 12).map(formatCar),
        })),
      noMatches: noMatches.slice(0, 50).map((match) => ({
        reason: match.reason,
        legacy: formatCar(match.legacy),
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!isApply) return;

  if (duplicateMergeTargets.length > 0) {
    throw new Error(
      `Refusing to apply: ${duplicateMergeTargets.length} RealOEM target rows are matched by multiple legacy rows.`,
    );
  }

  if (unsafeOwnerDeletes.length > 0) {
    throw new Error(
      `Refusing to apply: ${unsafeOwnerDeletes.length} owner-directed delete rows still have donor links.`,
    );
  }

  for (const action of mergeActions.sort(
    (a, b) => linkCount(b.legacy) - linkCount(a.legacy),
  )) {
    await applyMerge(action);
  }

  for (const action of deleteLegacyActions) {
    await applyDeleteLegacy(action);
  }
};

try {
  await run();
} finally {
  await db.$disconnect();
}
