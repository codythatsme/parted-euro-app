import { PrismaClient } from "@prisma/client";

import {
  baseChassisCode,
  deriveChassisCodeFromGeneration,
  inferEngineFromModel,
  normaliseBody,
  realOemKnownFieldsMatch,
  realOemModelAliases,
  realOemModelsMatch,
} from "../../src/server/realoem/chassis";
import {
  canTreatXDriveAsImplicit,
  canUseOwnerApprovedBaseChassis,
  getOwnerDirectedDeleteReason,
} from "../../src/server/realoem/legacy-rules";

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

type CandidateGroup = {
  count: number;
  uniqueBodies: string[];
  uniqueEngines: string[];
  cars: string[];
};

type TargetedCase = {
  label: string;
  legacy: string;
  sameChassisAlias: CandidateGroup;
  baseChassisAlias: CandidateGroup;
  sameChassisNearby: CandidateGroup;
  baseChassisNearby: CandidateGroup;
};

const db = new PrismaClient();
const isFull = process.argv.includes("--full");

const isPlaceholderCar = (car: DbCar): boolean =>
  car.series === "PE000" || car.series === "SS000";

const existingChassisCode = (car: DbCar): string | null =>
  car.chassisCode ?? deriveChassisCodeFromGeneration(car.generation);

const existingBody = (car: DbCar): string | null => normaliseBody(car.body);

const effectiveEngine = (car: DbCar): string | null =>
  car.engine?.trim() || inferEngineFromModel(car.model);

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
    car.series,
    car.generation,
    existingChassisCode(car) ?? "<no-chassis>",
    car.model,
    existingBody(car) ?? "<no-body>",
    car.engine ?? "<no-engine>",
    `donors=${car._count.Donor}`,
    `parts=${car._count.parts}`,
  ].join(" | ");

const summarizeCandidates = (cars: DbCar[], limit = 10): CandidateGroup => ({
  count: cars.length,
  uniqueBodies: uniqueValues(cars.map(existingBody)),
  uniqueEngines: uniqueValues(cars.map((car) => car.engine)),
  cars: cars.slice(0, limit).map(formatCar),
});

const classifyTargetedCase = (targetedCase: TargetedCase): string => {
  if (targetedCase.sameChassisAlias.count === 1) {
    return "sameChassisAliasUnique";
  }
  if (targetedCase.sameChassisAlias.count > 1) {
    return "sameChassisAliasAmbiguous";
  }
  if (targetedCase.baseChassisAlias.count === 1) {
    return "baseChassisAliasUnique";
  }
  if (targetedCase.baseChassisAlias.count > 1) {
    return "baseChassisAliasAmbiguous";
  }
  if (
    targetedCase.sameChassisNearby.count > 0 ||
    targetedCase.baseChassisNearby.count > 0
  ) {
    return "nearbyOnly";
  }
  return "noCandidate";
};

const summarizeTargetedCases = (
  targetedCases: TargetedCase[],
): Array<{
  label: string;
  total: number;
  buckets: Record<string, number>;
  samples: Array<{
    bucket: string;
    legacy: string;
    sameAliasCount: number;
    baseAliasCount: number;
    nearbyBodies: string[];
    nearbyEngines: string[];
    firstCandidate: string | null;
  }>;
}> => {
  const byLabel = new Map<string, TargetedCase[]>();
  for (const targetedCase of targetedCases) {
    const group = byLabel.get(targetedCase.label) ?? [];
    group.push(targetedCase);
    byLabel.set(targetedCase.label, group);
  }

  return [...byLabel.entries()].map(([label, cases]) => {
    const buckets: Record<string, number> = {};
    for (const targetedCase of cases) {
      const bucket = classifyTargetedCase(targetedCase);
      buckets[bucket] = (buckets[bucket] ?? 0) + 1;
    }

    return {
      label,
      total: cases.length,
      buckets,
      samples: cases.slice(0, 8).map((targetedCase) => ({
        bucket: classifyTargetedCase(targetedCase),
        legacy: targetedCase.legacy,
        sameAliasCount: targetedCase.sameChassisAlias.count,
        baseAliasCount: targetedCase.baseChassisAlias.count,
        nearbyBodies: uniqueValues([
          ...targetedCase.sameChassisNearby.uniqueBodies,
          ...targetedCase.baseChassisNearby.uniqueBodies,
        ]),
        nearbyEngines: uniqueValues([
          ...targetedCase.sameChassisNearby.uniqueEngines,
          ...targetedCase.baseChassisNearby.uniqueEngines,
        ]),
        firstCandidate:
          targetedCase.sameChassisAlias.cars[0] ??
          targetedCase.baseChassisAlias.cars[0] ??
          targetedCase.sameChassisNearby.cars[0] ??
          targetedCase.baseChassisNearby.cars[0] ??
          null,
      })),
    };
  });
};

const ownerCaseFilters: Array<{
  label: string;
  matches: (car: DbCar) => boolean;
}> = [
  {
    label: "Z3 E36/7 model prefix/decimal naming",
    matches: (car) => existingChassisCode(car) === "Z3" && car.series === "Z3",
  },
  {
    label: "E82/E88 LCI bracketed into RealOEM base chassis",
    matches: (car) => ["E82N", "E88N"].includes(existingChassisCode(car) ?? ""),
  },
  {
    label: "F20 year range/LCI split",
    matches: (car) => existingChassisCode(car) === "F20",
  },
  {
    label: "E85 Z4 model prefix naming",
    matches: (car) => existingChassisCode(car) === "E85",
  },
  {
    label: "E53/E70 X5 model prefix naming",
    matches: (car) =>
      ["E53", "E70", "E70N"].includes(existingChassisCode(car) ?? ""),
  },
  {
    label: "E36 316i Compact split engine variant",
    matches: (car) =>
      existingChassisCode(car) === "E36" &&
      car.model === "316i" &&
      existingBody(car) === "Compact",
  },
  {
    label: "E30/E34 is suffix aliases and missing RealOEM rows",
    matches: (car) =>
      ["E30", "E34"].includes(existingChassisCode(car) ?? "") &&
      /is|323i|325e/u.test(car.model),
  },
  {
    label: "F34 LCI legacy-only 328i",
    matches: (car) =>
      existingChassisCode(car) === "F34N" && car.model === "328i",
  },
  {
    label: "E60 LCI legacy-only 545i/M5",
    matches: (car) =>
      existingChassisCode(car) === "E60N" && ["545i", "M5"].includes(car.model),
  },
  {
    label: "G32 xDrive/X suffix naming",
    matches: (car) =>
      existingChassisCode(car) === "G32" && /xDrive/u.test(car.model),
  },
  {
    label: "E63/E64 LCI legacy-only 645Ci",
    matches: (car) =>
      ["E63N", "E64N"].includes(existingChassisCode(car) ?? "") &&
      car.model === "645Ci",
  },
];

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

  const ownerDirectedDelete = new Set<string>();
  const sameChassisAlias = new Set<string>();
  const sameChassisAliasAmbiguous = new Set<string>();
  const ownerApprovedBaseChassisAlias = new Set<string>();
  const ownerApprovedBaseChassisAliasAmbiguous = new Set<string>();
  const baseChassisReviewCandidate = new Set<string>();
  const noCandidate = new Set<string>();

  for (const legacy of legacyCars) {
    const chassisCode = existingChassisCode(legacy);
    if (chassisCode === null) {
      noCandidate.add(legacy.id);
      continue;
    }

    const deleteReason = getOwnerDirectedDeleteReason({
      chassisCode,
      series: legacy.series,
      model: legacy.model,
      body: existingBody(legacy),
    });
    if (deleteReason !== null) {
      ownerDirectedDelete.add(legacy.id);
      continue;
    }

    const sameAliasCandidates = enrichedCars.filter(
      (candidate) =>
        candidate.id !== legacy.id &&
        candidate.chassisCode === chassisCode &&
        knownFieldsMatch(legacy, candidate) &&
        legacyModelsMatch(legacy, candidate),
    );

    if (sameAliasCandidates.length === 1) {
      sameChassisAlias.add(legacy.id);
      continue;
    }

    if (sameAliasCandidates.length > 1) {
      sameChassisAliasAmbiguous.add(legacy.id);
      continue;
    }

    const baseChassis = baseChassisCode(chassisCode);
    const ownerApprovedBaseAliasCandidates =
      baseChassis === chassisCode
        ? []
        : enrichedCars.filter(
            (candidate) =>
              candidate.id !== legacy.id &&
              canUseOwnerApprovedBaseChassis(
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
              ) &&
              knownFieldsMatch(legacy, candidate) &&
              legacyModelsMatch(legacy, candidate),
          );

    if (ownerApprovedBaseAliasCandidates.length === 1) {
      ownerApprovedBaseChassisAlias.add(legacy.id);
      continue;
    }

    if (ownerApprovedBaseAliasCandidates.length > 1) {
      ownerApprovedBaseChassisAliasAmbiguous.add(legacy.id);
      continue;
    }

    const baseReviewCandidates =
      baseChassis === chassisCode
        ? []
        : enrichedCars.filter(
            (candidate) =>
              candidate.id !== legacy.id &&
              candidate.chassisCode === baseChassis &&
              knownFieldsMatch(legacy, candidate) &&
              legacyModelsMatch(legacy, candidate),
          );

    if (baseReviewCandidates.length > 0) {
      baseChassisReviewCandidate.add(legacy.id);
      continue;
    }

    noCandidate.add(legacy.id);
  }

  const targetedCases: TargetedCase[] = [];
  for (const { label, matches } of ownerCaseFilters) {
    for (const legacy of legacyCars.filter(matches)) {
      const chassisCode = existingChassisCode(legacy);
      if (chassisCode === null) continue;

      const sameChassisCars = enrichedCars.filter(
        (candidate) =>
          candidate.id !== legacy.id &&
          candidate.chassisCode === chassisCode &&
          knownFieldsMatch(legacy, candidate),
      );
      const baseChassis = baseChassisCode(chassisCode);
      const baseChassisCars =
        baseChassis === chassisCode
          ? []
          : enrichedCars.filter(
              (candidate) =>
                candidate.id !== legacy.id &&
                candidate.chassisCode === baseChassis &&
                knownFieldsMatch(legacy, candidate),
            );

      targetedCases.push({
        label,
        legacy: formatCar(legacy),
        sameChassisAlias: summarizeCandidates(
          sameChassisCars.filter((candidate) =>
            legacyModelsMatch(legacy, candidate),
          ),
        ),
        baseChassisAlias: summarizeCandidates(
          baseChassisCars.filter((candidate) =>
            legacyModelsMatch(legacy, candidate),
          ),
        ),
        sameChassisNearby: summarizeCandidates(sameChassisCars, 6),
        baseChassisNearby: summarizeCandidates(baseChassisCars, 6),
      });
    }
  }

  const noCandidateRows = legacyCars.filter((car) => noCandidate.has(car.id));
  const ownerDirectedDeleteRows = legacyCars.filter((car) =>
    ownerDirectedDelete.has(car.id),
  );

  const report = {
    db: {
      cars: cars.length,
      legacyIncompleteBmwCars: legacyCars.length,
      enrichedBmwCars: enrichedCars.length,
    },
    extendedAliasBuckets: {
      ownerDirectedDeletes: ownerDirectedDelete.size,
      sameChassisAliasUnique: sameChassisAlias.size,
      sameChassisAliasAmbiguous: sameChassisAliasAmbiguous.size,
      ownerApprovedBaseChassisAliasUnique: ownerApprovedBaseChassisAlias.size,
      ownerApprovedBaseChassisAliasAmbiguous:
        ownerApprovedBaseChassisAliasAmbiguous.size,
      baseChassisReviewCandidates: baseChassisReviewCandidate.size,
      noCandidate: noCandidate.size,
    },
    targetedCaseSummary: summarizeTargetedCases(targetedCases),
    targetedCases: isFull ? targetedCases : undefined,
    ownerDirectedDeleteRows: ownerDirectedDeleteRows.map((car) => ({
      reason:
        getOwnerDirectedDeleteReason({
          chassisCode: existingChassisCode(car),
          series: car.series,
          model: car.model,
          body: existingBody(car),
        }) ?? "Owner directed delete",
      car: formatCar(car),
    })),
    noCandidateRows: noCandidateRows.map((car) => ({
      car: formatCar(car),
      aliases: [
        ...realOemModelAliases(car, {
          includeDriveNeutralAliases: true,
        }),
      ].sort(),
    })),
  };

  console.log(JSON.stringify(report, null, 2));
};

try {
  await run();
} finally {
  await db.$disconnect();
}
