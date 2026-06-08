import { readFile } from "node:fs/promises";
import path from "node:path";

import { PrismaClient } from "@prisma/client";

import {
  deriveChassisCodeFromGeneration,
  inferEngineFromModel,
  normalizeRealOemCatalog,
  normaliseBody,
  realOemKnownFieldsMatch,
  realOemModelsMatch,
  type NormalizedRealOemRow,
  type RealOemCatalogRow,
} from "../src/server/realoem/chassis";
import {
  canTreatXDriveAsImplicit,
  canUseOwnerApprovedBaseChassis,
  isOwnerDirectedDelete,
} from "../src/server/realoem/legacy-rules";

const CATALOG_PATH = path.resolve(process.cwd(), "data/realoem-bmw.json");

type DbCar = {
  id: string;
  make: string;
  series: string;
  generation: string;
  chassisCode: string | null;
  model: string;
  body: string | null;
  engine: string | null;
};

type PlannedUpdate = {
  id: string;
  before: DbCar;
  after: NormalizedRealOemRow;
  reason: string;
};

type GenerationConflict = {
  chassisCode: string;
  generations: { generation: string; count: number }[];
  selected: string;
};

type SkippedGenerationOverride = {
  chassisCode: string;
  generations: { generation: string; count: number }[];
  reason: string;
};

type JoinHealth = {
  orphanCarRefs: {
    rows: number;
    distinctCarIds: number;
  };
  orphanPartRefs: {
    rows: number;
    distinctPartNos: number;
  };
};

const db = new PrismaClient();

const isApply = process.argv.includes("--apply");
const allowInvalid = process.argv.includes("--allow-invalid");

const STALE_GENERATION_OVERRIDE_CHASSIS = new Set(["F20", "F40", "F98"]);

const isPlaceholderCar = (car: DbCar): boolean =>
  car.series === "PE000" || car.series === "SS000";

const normalizeExistingBody = (car: DbCar): string | null =>
  normaliseBody(car.body);

const existingChassisCode = (car: DbCar): string | null =>
  car.chassisCode ?? deriveChassisCodeFromGeneration(car.generation);

const effectiveExistingEngine = (car: DbCar): string | null =>
  car.engine?.trim() || inferEngineFromModel(car.model);

const carMatchesTuple = (car: DbCar, row: NormalizedRealOemRow): boolean =>
  car.make === "BMW" &&
  existingChassisCode(car) === row.chassisCode &&
  car.model === row.model &&
  normalizeExistingBody(car) === row.body &&
  car.engine === row.engine;

const legacyModelsMatch = (car: DbCar, row: NormalizedRealOemRow): boolean =>
  realOemModelsMatch(car, row, {
    allowXDriveToPlain: canTreatXDriveAsImplicit(
      {
        chassisCode: existingChassisCode(car),
        series: car.series,
        model: car.model,
        body: normalizeExistingBody(car),
      },
      {
        chassisCode: row.chassisCode,
        series: row.series,
        model: row.model,
        body: row.body,
      },
    ),
  });

const isLegacyCandidate = (
  car: DbCar,
  row: NormalizedRealOemRow,
  usedLegacyIds: ReadonlySet<string>,
): boolean => {
  if (usedLegacyIds.has(car.id)) return false;
  if (car.make !== "BMW") return false;
  if (isPlaceholderCar(car)) return false;

  const chassisCode = existingChassisCode(car);
  const body = normalizeExistingBody(car);

  if (
    isOwnerDirectedDelete({
      chassisCode,
      series: car.series,
      model: car.model,
      body,
    })
  ) {
    return false;
  }

  const chassisMatches =
    chassisCode === row.chassisCode ||
    canUseOwnerApprovedBaseChassis(
      {
        chassisCode,
        series: car.series,
        model: car.model,
        body,
      },
      {
        chassisCode: row.chassisCode,
        series: row.series,
        model: row.model,
        body: row.body,
      },
    );
  if (!chassisMatches) return false;
  if (!legacyModelsMatch(car, row)) return false;

  return realOemKnownFieldsMatch(
    {
      body,
      engine: effectiveExistingEngine(car),
    },
    {
      body: row.body,
      engine: row.engine,
    },
  );
};

const chooseLegacyCandidate = (
  cars: DbCar[],
  row: NormalizedRealOemRow,
  usedLegacyIds: ReadonlySet<string>,
  compatibleCatalogRowsByCarId: ReadonlyMap<string, NormalizedRealOemRow[]>,
): { car: DbCar; reason: string } | null => {
  const candidates = cars.filter((car) =>
    isLegacyCandidate(car, row, usedLegacyIds),
  );
  if (candidates.length === 0) return null;

  const unambiguousCandidates = candidates.filter(
    (candidate) => compatibleCatalogRowsByCarId.get(candidate.id)?.length === 1,
  );
  if (unambiguousCandidates.length !== 1) return null;

  const car = unambiguousCandidates[0];
  if (car === undefined) return null;

  return {
    car,
    reason:
      existingChassisCode(car) === row.chassisCode
        ? "Unique owner-approved model alias; preserving existing car ID"
        : "Unique owner-approved base chassis match; preserving existing car ID",
  };
};

const needsUpdate = (car: DbCar, row: NormalizedRealOemRow): boolean =>
  car.series !== row.series ||
  car.generation !== row.generation ||
  car.chassisCode !== row.chassisCode ||
  car.model !== row.model ||
  normalizeExistingBody(car) !== row.body ||
  car.engine !== row.engine;

const formatCar = (car: DbCar): string =>
  [
    car.make,
    car.series,
    car.generation,
    existingChassisCode(car) ?? "<no-chassis>",
    car.model,
    normalizeExistingBody(car) ?? "<no-body>",
    car.engine ?? "<no-engine>",
  ].join(" ");

const buildGenerationOverrides = (
  cars: DbCar[],
): {
  overrides: Map<string, string>;
  conflicts: GenerationConflict[];
  skipped: SkippedGenerationOverride[];
} => {
  const counts = new Map<string, Map<string, number>>();

  for (const car of cars) {
    if (car.make !== "BMW" || isPlaceholderCar(car)) continue;
    const chassisCode = existingChassisCode(car);
    if (chassisCode === null) continue;

    const generationCounts =
      counts.get(chassisCode) ?? new Map<string, number>();
    generationCounts.set(
      car.generation,
      (generationCounts.get(car.generation) ?? 0) + 1,
    );
    counts.set(chassisCode, generationCounts);
  }

  const overrides = new Map<string, string>();
  const conflicts: GenerationConflict[] = [];
  const skipped: SkippedGenerationOverride[] = [];

  for (const [chassisCode, generationCounts] of counts) {
    const generations = [...generationCounts.entries()]
      .map(([generation, count]) => ({ generation, count }))
      .sort(
        (a, b) => b.count - a.count || a.generation.localeCompare(b.generation),
      );

    const selected = generations[0];
    if (selected === undefined) continue;

    if (STALE_GENERATION_OVERRIDE_CHASSIS.has(chassisCode)) {
      skipped.push({
        chassisCode,
        generations,
        reason:
          "Known stale legacy generation label; using RealOEM-derived range",
      });
      continue;
    }

    overrides.set(chassisCode, selected.generation);

    if (generations.length > 1) {
      conflicts.push({
        chassisCode,
        generations,
        selected: selected.generation,
      });
    }
  }

  return { overrides, conflicts, skipped };
};

const getJoinHealth = async (): Promise<JoinHealth | null> => {
  try {
    const [orphanCarRefs, orphanPartRefs] = await Promise.all([
      db.$queryRaw<
        { rows: number; distinct_car_ids: number }[]
      >`SELECT COUNT(*)::int AS rows, COUNT(DISTINCT j."A")::int AS distinct_car_ids
        FROM partedeuro."_CarToPartDetail" j
        LEFT JOIN partedeuro."Car" c ON c.id = j."A"
        WHERE c.id IS NULL`,
      db.$queryRaw<
        { rows: number; distinct_part_nos: number }[]
      >`SELECT COUNT(*)::int AS rows, COUNT(DISTINCT j."B")::int AS distinct_part_nos
        FROM partedeuro."_CarToPartDetail" j
        LEFT JOIN partedeuro."PartDetail" p ON p."partNo" = j."B"
        WHERE p."partNo" IS NULL`,
    ]);

    const carRefs = orphanCarRefs[0];
    const partRefs = orphanPartRefs[0];
    if (carRefs === undefined || partRefs === undefined) return null;

    return {
      orphanCarRefs: {
        rows: carRefs.rows,
        distinctCarIds: carRefs.distinct_car_ids,
      },
      orphanPartRefs: {
        rows: partRefs.rows,
        distinctPartNos: partRefs.distinct_part_nos,
      },
    };
  } catch {
    return null;
  }
};

const run = async (): Promise<void> => {
  const rawCatalog = JSON.parse(
    await readFile(CATALOG_PATH, "utf8"),
  ) as RealOemCatalogRow[];

  const cars = await db.car.findMany({
    orderBy: [{ make: "asc" }, { series: "asc" }, { generation: "asc" }],
  });

  const dbCars = cars as DbCar[];
  const { overrides, conflicts, skipped } = buildGenerationOverrides(dbCars);
  const catalog = normalizeRealOemCatalog(rawCatalog, overrides);

  const bmwCars = dbCars.filter((car) => car.make === "BMW");
  const importableCars = bmwCars.filter((car) => !isPlaceholderCar(car));
  const landRoverCars = dbCars.filter((car) => car.make === "Land Rover");
  const usedLegacyIds = new Set<string>();
  const matchedExistingIds = new Set<string>();
  const plannedUpdates: PlannedUpdate[] = [];
  const plannedInserts: NormalizedRealOemRow[] = [];
  const noops: { id: string; row: NormalizedRealOemRow }[] = [];
  const compatibleCatalogRowsByCarId = new Map<
    string,
    NormalizedRealOemRow[]
  >();

  for (const car of importableCars) {
    const compatibleRows = catalog.rows.filter((row) =>
      isLegacyCandidate(car, row, new Set()),
    );
    if (compatibleRows.length > 0) {
      compatibleCatalogRowsByCarId.set(car.id, compatibleRows);
    }
  }

  for (const row of catalog.rows) {
    const exact = importableCars.find((car) => carMatchesTuple(car, row));

    if (exact !== undefined) {
      matchedExistingIds.add(exact.id);
      if (needsUpdate(exact, row)) {
        plannedUpdates.push({
          id: exact.id,
          before: exact,
          after: row,
          reason: "Exact tuple match needs normalization",
        });
      } else {
        noops.push({ id: exact.id, row });
      }
      continue;
    }

    const legacy = chooseLegacyCandidate(
      importableCars,
      row,
      usedLegacyIds,
      compatibleCatalogRowsByCarId,
    );
    if (legacy !== null) {
      usedLegacyIds.add(legacy.car.id);
      matchedExistingIds.add(legacy.car.id);
      plannedUpdates.push({
        id: legacy.car.id,
        before: legacy.car,
        after: row,
        reason: legacy.reason,
      });
      continue;
    }

    plannedInserts.push(row);
  }

  const dbOnlyBmw = importableCars.filter(
    (car) => !matchedExistingIds.has(car.id),
  );

  const joinHealth = await getJoinHealth();

  const report = {
    mode: isApply ? "apply" : "dry",
    allowInvalid,
    catalog: {
      sourceRows: rawCatalog.length,
      normalizedRows: catalog.rows.length,
      invalidRows: catalog.invalidRows.length,
      duplicateKeyGroups: catalog.duplicateGroups.length,
    },
    db: {
      cars: dbCars.length,
      bmwCars: bmwCars.length,
      landRoverCars: landRoverCars.length,
      placeholderBmwCars: bmwCars.length - importableCars.length,
      generationOverrideConflicts: conflicts.length,
      staleGenerationOverridesSkipped: skipped.length,
      compatibilityJoinHealth: joinHealth,
    },
    plan: {
      updateExistingCars: plannedUpdates.length,
      insertCars: plannedInserts.length,
      noops: noops.length,
      unambiguousLegacyRowsPreserved: plannedUpdates.filter((update) =>
        update.reason.includes("preserving existing car ID"),
      ).length,
      ambiguousLegacyRowsForReview: [
        ...compatibleCatalogRowsByCarId.values(),
      ].filter((rows) => rows.length > 1).length,
      dbOnlyBmwCarsForReview: dbOnlyBmw.length,
      untouchedLandRoverCars: landRoverCars.length,
    },
    samples: {
      invalidRows: catalog.invalidRows.slice(0, 20),
      duplicateGroups: catalog.duplicateGroups.slice(0, 20).map((group) => ({
        key: group.key,
        count: group.count,
        ranges: group.rows.map(
          (row) => `${row.productionFrom}-${row.productionTo}`,
        ),
      })),
      generationConflicts: conflicts.slice(0, 20),
      skippedGenerationOverrides: skipped.slice(0, 20),
      updates: plannedUpdates.slice(0, 20).map((update) => ({
        id: update.id,
        reason: update.reason,
        before: formatCar(update.before),
        after: update.after,
      })),
      inserts: plannedInserts.slice(0, 20),
      dbOnly: dbOnlyBmw.slice(0, 40).map((car) => ({
        id: car.id,
        car: formatCar(car),
      })),
    },
  };

  console.log(JSON.stringify(report, null, 2));

  if (!isApply) return;

  if (catalog.invalidRows.length > 0 && !allowInvalid) {
    throw new Error(
      `Refusing to apply while ${catalog.invalidRows.length} RealOEM rows are invalid.`,
    );
  }

  await db.$transaction(async (tx) => {
    await tx.car.updateMany({
      where: { body: "" },
      data: { body: null },
    });

    for (const update of plannedUpdates) {
      await tx.car.update({
        where: { id: update.id },
        data: {
          series: update.after.series,
          generation: update.after.generation,
          chassisCode: update.after.chassisCode,
          model: update.after.model,
          body: update.after.body,
          engine: update.after.engine,
        },
      });
    }

    for (const insert of plannedInserts) {
      await tx.car.create({
        data: {
          make: "BMW",
          series: insert.series,
          generation: insert.generation,
          chassisCode: insert.chassisCode,
          model: insert.model,
          body: insert.body,
          engine: insert.engine,
        },
      });
    }
  });
};

try {
  await run();
} finally {
  await db.$disconnect();
}
