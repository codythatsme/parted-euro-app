import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  normalizeRealOemCatalog,
  type RealOemCatalogRow,
} from "../../src/server/realoem/chassis";

const CATALOG_PATH = path.resolve(process.cwd(), "data/realoem-bmw.json");

const catalog = JSON.parse(
  await readFile(CATALOG_PATH, "utf8"),
) as RealOemCatalogRow[];

const result = normalizeRealOemCatalog(catalog);

const generations = new Set(result.rows.map((row) => row.generation));
const chassisCodes = new Set(result.rows.map((row) => row.chassisCode));
const engines = new Set(result.rows.map((row) => row.engine));
const bodies = new Set(result.rows.map((row) => row.body));

console.log(
  JSON.stringify(
    {
      sourceRows: catalog.length,
      normalizedRows: result.rows.length,
      invalidRows: result.invalidRows.length,
      duplicateKeyGroups: result.duplicateGroups.length,
      distinctChassisCodes: chassisCodes.size,
      distinctGenerations: generations.size,
      distinctEngines: engines.size,
      bodies: [...bodies].sort(),
      invalidSamples: result.invalidRows.slice(0, 20),
      duplicateSamples: result.duplicateGroups.slice(0, 20).map((group) => ({
        key: group.key,
        count: group.count,
        ranges: group.rows.map(
          (row) => `${row.productionFrom}-${row.productionTo}`,
        ),
      })),
    },
    null,
    2,
  ),
);

if (result.invalidRows.length > 0) {
  process.exitCode = 1;
}
