/**
 * Match scraped RealOEM fitment tuples against existing Car rows.
 *
 * Car has @@unique([make, chassisCode, model, body, engine]) — purpose-built
 * (see the original realoem.md) so a scraped tuple maps 1:1 to a Car. We index
 * all BMW Car rows once, then look up each tuple by a normalized key.
 *
 * Normalization mirrors the original RealOEM import (chassis.ts):
 *  - model: strip a leading "BMW " prefix, trim
 *  - body / engine: trim
 *  - chassisCode: collapse realoem's E36/7 & E36/8 to the stored "Z3"
 */

import type { PrismaClient } from "@prisma/client";
import type { RealoemTuple } from "./scrape";

const CHASSIS_REMAP: Record<string, string> = { "E36/7": "Z3", "E36/8": "Z3" };

const normModel = (m: string): string => m.replace(/^BMW\s+/i, "").trim();
const normBodyKey = (b: string | null): string => {
  const t = (b ?? "").trim();
  return t.length ? t : "∅";
};
const normEngineKey = (e: string | null): string => {
  const t = (e ?? "").trim();
  return t.length ? t : "∅";
};
const keyOf = (
  chassis: string,
  model: string,
  body: string | null,
  engine: string | null,
): string =>
  [CHASSIS_REMAP[chassis] ?? chassis, normModel(model), normBodyKey(body), normEngineKey(engine)].join(
    "||",
  );

export interface MatchResult {
  /** Distinct Car ids the part is compatible with. */
  matchedCarIds: string[];
  /** Fitments realoem lists but we have no Car row for (logged for catalog review). */
  unmatched: RealoemTuple[];
}

export async function matchTuplesToCars(
  db: PrismaClient,
  tuples: RealoemTuple[],
): Promise<MatchResult> {
  const cars = await db.car.findMany({
    where: { make: "BMW" },
    select: { id: true, chassisCode: true, model: true, body: true, engine: true },
  });

  const index = new Map<string, string>();
  for (const c of cars) {
    if (c.chassisCode === null) continue;
    const k = keyOf(c.chassisCode, c.model, c.body, c.engine);
    if (!index.has(k)) index.set(k, c.id);
  }

  const matchedCarIds = new Set<string>();
  const unmatched: RealoemTuple[] = [];
  for (const t of tuples) {
    const id = index.get(keyOf(t.chassisCode, t.model, t.body, t.engine));
    if (id) matchedCarIds.add(id);
    else unmatched.push(t);
  }

  return { matchedCarIds: Array.from(matchedCarIds), unmatched };
}
