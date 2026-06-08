export type RealOemCatalogRow = {
  series: string;
  chassisCode: string;
  model: string;
  body: string | null;
  engine: string | null;
  productionFrom: string;
  productionTo: string;
};

export type NormalizedRealOemRow = {
  series: string;
  chassisCode: string;
  generation: string;
  model: string;
  body: string;
  engine: string;
  productionFrom: string;
  productionTo: string;
};

export type CatalogValidationIssue = {
  reason: string;
  row: RealOemCatalogRow;
};

export type DuplicateCatalogGroup = {
  key: string;
  count: number;
  rows: NormalizedRealOemRow[];
};

export type NormalizedCatalogResult = {
  rows: NormalizedRealOemRow[];
  invalidRows: CatalogValidationIssue[];
  duplicateGroups: DuplicateCatalogGroup[];
};

const YEAR_RANGE_SUFFIX = /\s*\([^)]*\)\s*$/;
const PRODUCTION_DATE = /^(\d{2})\/(\d{4})$/;

const EXPLICIT_CHASSIS_REMAP: Record<string, string> = {
  "E36/7": "Z3",
  "E36/8": "Z3",
};

export const normaliseBody = (
  body: string | null | undefined,
): string | null => {
  if (body == null) return null;
  const trimmed = body.trim();
  return trimmed.length === 0 ? null : trimmed;
};

export const normaliseModel = (model: string): string =>
  model.replace(/^BMW\s+/i, "").trim();

type DriveKind = "none" | "s" | "x";

export type RealOemModelIdentity = {
  series: string;
  model: string;
};

export type RealOemKnownFields = {
  body?: string | null;
  engine?: string | null;
};

const escapeRegExp = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const compactRealOemModel = (model: string, series: string): string => {
  const normalizedSeries = series
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "");

  return model
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/^bmw\s+/, "")
    .trim()
    .replace(/\([^)]*\)/g, "")
    .replace(new RegExp(`^${escapeRegExp(normalizedSeries)}\\s*`, "u"), "")
    .replace(/\bxdrive(?=[0-9a-z])/g, "")
    .replace(/\bsdrive(?=[0-9a-z])/g, "")
    .replace(/\bxdrive\b/g, "")
    .replace(/\bsdrive\b/g, "")
    .replace(/[\s'._()/-]+/g, "");
};

const driveKindForModel = (model: string, compact: string): DriveKind => {
  const normalized = model.toLowerCase();
  if (
    /\bxdrive\b/u.test(normalized) ||
    /\bxdrive(?=[0-9a-z])/u.test(normalized)
  ) {
    return "x";
  }
  if (
    /\bsdrive\b/u.test(normalized) ||
    /\bsdrive(?=[0-9a-z])/u.test(normalized)
  ) {
    return "s";
  }
  return /[0-9][a-z0-9]*x$/u.test(compact) ? "x" : "none";
};

const addNumericModelAliases = (
  aliases: Set<string>,
  compact: string,
): void => {
  const sportSuffix = compact.match(/^([0-9]{3})is$/u);
  if (sportSuffix?.[1] !== undefined) {
    aliases.add(`${sportSuffix[1]}i`);
  }

  const decimalWithI = compact.match(/^([0-9]+(?:\.[0-9]+))i$/u);
  if (decimalWithI?.[1] !== undefined) {
    aliases.add(decimalWithI[1]);
  }

  const decimalWithoutI = compact.match(/^([0-9]+(?:\.[0-9]+))$/u);
  if (decimalWithoutI?.[1] !== undefined) {
    aliases.add(`${decimalWithoutI[1]}i`);
  }

  const compactDecimalWithI = compact.match(/^([0-9]{2})i$/u);
  if (compactDecimalWithI?.[1] !== undefined) {
    aliases.add(compactDecimalWithI[1]);
  }

  const compactDecimalWithoutI = compact.match(/^([0-9]{2})$/u);
  if (compactDecimalWithoutI?.[1] !== undefined) {
    aliases.add(`${compactDecimalWithoutI[1]}i`);
  }
};

export const realOemModelAliases = (
  identity: RealOemModelIdentity,
  options: { includeDriveNeutralAliases?: boolean } = {},
): Set<string> => {
  const compact = compactRealOemModel(identity.model, identity.series);
  const aliases = new Set<string>([compact]);

  addNumericModelAliases(aliases, compact);

  if (options.includeDriveNeutralAliases) {
    const withoutTrailingX = compact.replace(/([0-9][a-z0-9]*)x$/u, "$1");
    aliases.add(withoutTrailingX);
    addNumericModelAliases(aliases, withoutTrailingX);
  }

  return aliases;
};

const hasAliasOverlap = (
  left: RealOemModelIdentity,
  right: RealOemModelIdentity,
  includeDriveNeutralAliases = false,
): boolean => {
  const leftAliases = realOemModelAliases(left, {
    includeDriveNeutralAliases,
  });
  const rightAliases = realOemModelAliases(right, {
    includeDriveNeutralAliases,
  });

  return [...leftAliases].some((alias) => rightAliases.has(alias));
};

export const realOemModelsMatch = (
  left: RealOemModelIdentity,
  right: RealOemModelIdentity,
  options: { allowXDriveToPlain?: boolean } = {},
): boolean => {
  const leftCompact = compactRealOemModel(left.model, left.series);
  const rightCompact = compactRealOemModel(right.model, right.series);
  const leftDrive = driveKindForModel(left.model, leftCompact);
  const rightDrive = driveKindForModel(right.model, rightCompact);

  if (
    (leftDrive === "x" && rightDrive === "s") ||
    (leftDrive === "s" && rightDrive === "x")
  ) {
    return false;
  }

  if (
    (leftDrive === "x" && rightDrive === "none") ||
    (leftDrive === "none" && rightDrive === "x")
  ) {
    return options.allowXDriveToPlain
      ? hasAliasOverlap(left, right, true)
      : false;
  }

  if (hasAliasOverlap(left, right)) return true;

  return leftDrive !== "none" || rightDrive !== "none"
    ? hasAliasOverlap(left, right, true)
    : false;
};

export const realOemKnownFieldsMatch = (
  known: RealOemKnownFields,
  candidate: { body: string; engine: string },
): boolean => {
  const body = normaliseBody(known.body);
  const engine = known.engine?.trim() || null;
  if (body !== null && normaliseBody(candidate.body) !== body) return false;
  if (engine !== null && candidate.engine.trim() !== engine) return false;
  return true;
};

export const inferEngineFromModel = (model: string): string | null => {
  const match = model.match(/\(([A-Z][A-Z0-9]+)\)/iu);
  return match?.[1]?.toUpperCase() ?? null;
};

export const baseChassisCode = (chassisCode: string): string => {
  const trimmed = chassisCode.trim();
  return /^[EFG]\d{2}N$/.test(trimmed) ? trimmed.slice(0, -1) : trimmed;
};

export const isLciChassisCode = (chassisCode: string): boolean =>
  /^[EFG]\d{2}N$/.test(chassisCode.trim());

export const deriveChassisCodeFromGeneration = (
  generation: string,
): string | null => {
  const withoutYears = generation.replace(YEAR_RANGE_SUFFIX, "").trim();
  if (withoutYears.length === 0) return null;

  const tokens = withoutYears.split(/\s+/);
  const first = tokens[0];
  if (first === undefined) return null;

  const remap = EXPLICIT_CHASSIS_REMAP[first];
  if (remap !== undefined) return remap;

  const hasLci = tokens.slice(1).some((token) => token.toUpperCase() === "LCI");
  return hasLci ? `${first}N` : first;
};

const parseProductionYear = (value: string): number | null => {
  const match = value.match(PRODUCTION_DATE);
  if (match === null) return null;
  const year = Number(match[2]);
  return Number.isFinite(year) ? year : null;
};

const formatGeneration = (
  chassisCode: string,
  fromYear: number,
  toYear: number,
): string => {
  const base = baseChassisCode(chassisCode);
  const label = isLciChassisCode(chassisCode) ? `${base} LCI` : base;
  return `${label} (${fromYear} - ${toYear})`;
};

export const buildGenerationByChassis = (
  rows: RealOemCatalogRow[],
): Map<string, string> => {
  const ranges = new Map<string, { from: number; to: number }>();

  for (const row of rows) {
    const chassisCode = row.chassisCode.trim();
    if (chassisCode.length === 0) continue;

    const fromYear = parseProductionYear(row.productionFrom);
    const toYear = parseProductionYear(row.productionTo);
    if (fromYear === null || toYear === null) continue;

    const existing = ranges.get(chassisCode);
    ranges.set(chassisCode, {
      from: Math.min(existing?.from ?? fromYear, fromYear),
      to: Math.max(existing?.to ?? toYear, toYear),
    });
  }

  return new Map(
    [...ranges.entries()].map(([chassisCode, range]) => [
      chassisCode,
      formatGeneration(chassisCode, range.from, range.to),
    ]),
  );
};

const catalogKey = (row: NormalizedRealOemRow): string =>
  [row.chassisCode, row.model, row.body, row.engine].join("\t");

export const normalizeRealOemCatalog = (
  rows: RealOemCatalogRow[],
  generationOverrides: ReadonlyMap<string, string> = new Map(),
): NormalizedCatalogResult => {
  const generationByChassis = buildGenerationByChassis(rows);
  const invalidRows: CatalogValidationIssue[] = [];
  const normalizedRows: NormalizedRealOemRow[] = [];

  for (const row of rows) {
    const series = row.series.trim();
    const chassisCode = row.chassisCode.trim();
    const model = normaliseModel(row.model);
    const body = normaliseBody(row.body);
    const engine = row.engine?.trim() ?? "";
    const generation =
      generationOverrides.get(chassisCode) ??
      generationByChassis.get(chassisCode);

    const missing: string[] = [];
    if (series.length === 0) missing.push("series");
    if (chassisCode.length === 0) missing.push("chassisCode");
    if (generation === undefined) missing.push("generation");
    if (model.length === 0) missing.push("model");
    if (body === null) missing.push("body");
    if (engine.length === 0) missing.push("engine");

    if (missing.length > 0) {
      invalidRows.push({
        reason: `Missing ${missing.join(", ")}`,
        row,
      });
      continue;
    }

    if (generation === undefined || body === null) continue;

    normalizedRows.push({
      series,
      chassisCode,
      generation,
      model,
      body,
      engine,
      productionFrom: row.productionFrom,
      productionTo: row.productionTo,
    });
  }

  const byKey = new Map<string, NormalizedRealOemRow[]>();
  for (const row of normalizedRows) {
    const key = catalogKey(row);
    const group = byKey.get(key) ?? [];
    group.push(row);
    byKey.set(key, group);
  }

  const duplicateGroups = [...byKey.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => ({
      key,
      count: group.length,
      rows: group,
    }));

  const dedupedRows = [...byKey.values()].map((group) =>
    group.reduce((best, row) =>
      row.productionFrom < best.productionFrom ? row : best,
    ),
  );

  return {
    rows: dedupedRows.sort((a, b) =>
      [a.series, a.generation, a.model, a.body, a.engine]
        .join("\t")
        .localeCompare(
          [b.series, b.generation, b.model, b.body, b.engine].join("\t"),
        ),
    ),
    invalidRows,
    duplicateGroups,
  };
};
