import { PartStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
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

  return Sentry.startSpan(
    {
      name: "cron.releaseStaleReservations",
      op: "function",
    },
    async (rootSpan) => {
      const cutoffDate = new Date(Date.now() - 60 * 60 * 1000);
      rootSpan.setAttribute("cutoff", cutoffDate.toISOString());

      const staleReservedParts = await Sentry.startSpan(
        {
          name: "cron.findStaleParts",
          op: "db",
          attributes: { cutoff: cutoffDate.toISOString() },
        },
        async (span) => {
          const found = await db.part.findMany({
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
          span.setAttribute("staleCount", found.length);
          return found;
        },
      );

      const result = await Sentry.startSpan(
        {
          name: "cron.releaseParts",
          op: "db",
          attributes: { candidateCount: staleReservedParts.length },
        },
        async (span) => {
          const updated = await db.part.updateMany({
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
          span.setAttribute("releasedCount", updated.count);
          return updated;
        },
      );

      rootSpan.setAttribute("releasedCount", result.count);

      const affectedListingIds = staleReservedParts
        .map((part) => part.allocatedToListingId)
        .filter((listingId): listingId is string => Boolean(listingId));
      rootSpan.setAttribute("affectedListingCount", affectedListingIds.length);

      await Sentry.startSpan(
        {
          name: "cron.ebay.syncAfterRelease",
          op: "http.client",
          attributes: { listingCount: affectedListingIds.length },
        },
        async () =>
          syncEbayQuantitiesForListings(affectedListingIds).catch((error) => {
            console.error(
              "eBay quantity sync failed during stale reservation cleanup",
              error,
            );
            Sentry.captureException(error, {
              tags: { flow: "cron", step: "ebay.syncAfterRelease" },
              extra: { listingIds: affectedListingIds },
            });
          }),
      );

      return NextResponse.json({
        released: result.count,
        cutoff: cutoffDate.toISOString(),
      });
    },
  );
};
