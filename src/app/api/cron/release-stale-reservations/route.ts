import { PartStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { db } from "~/server/db";
import { syncEbayQuantitiesForListings } from "~/server/lib/ebay-sync";

export const dynamic = "force-dynamic";

export const GET = async (request: Request) => {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const header = request.headers.get("x-cron-secret");
    if (header !== cronSecret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  const cutoffDate = new Date(Date.now() - 60 * 60 * 1000);
  const staleReservedParts = await db.part.findMany({
    where: {
      status: PartStatus.RESERVED,
      reservedAt: {
        lt: cutoffDate,
      },
    },
    select: {
      allocatedToListingId: true,
    },
  });

  const result = await db.part.updateMany({
    where: {
      status: PartStatus.RESERVED,
      reservedAt: {
        lt: cutoffDate,
      },
    },
    data: {
      status: PartStatus.AVAILABLE,
      reservedAt: null,
    },
  });

  const affectedListingIds = staleReservedParts
    .map((part) => part.allocatedToListingId)
    .filter((listingId): listingId is string => Boolean(listingId));
  await syncEbayQuantitiesForListings(affectedListingIds).catch((error) => {
    console.error("eBay quantity sync failed during stale reservation cleanup", error);
  });

  return NextResponse.json({
    released: result.count,
    cutoff: cutoffDate.toISOString(),
  });
};
