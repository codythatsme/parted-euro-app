import * as Sentry from "@sentry/nextjs";
import { db } from "~/server/db";
import { calculateStock } from "~/server/lib/stock";
import { ebay, initEbayClient } from "~/server/lib/ebay-client";

export const syncEbayQuantityForListing = async (listingId: string) =>
  Sentry.startSpan(
    {
      name: "ebay.sync.listing",
      op: "http.client",
      attributes: { listingId },
    },
    async (span) => {
      const listing = await db.listing.findUnique({
        where: {
          id: listingId,
        },
        select: {
          id: true,
          listedOnEbay: true,
          ebayOfferId: true,
          components: {
            select: {
              partDetailId: true,
              quantity: true,
            },
          },
          allocatedParts: {
            select: {
              partDetailsId: true,
              status: true,
            },
          },
        },
      });

      if (!listing?.listedOnEbay || !listing.ebayOfferId) {
        span.setAttribute("skipped", "listing-not-linked");
        return { success: false, reason: "listing-not-linked" as const };
      }

      const ebayOfferId = listing.ebayOfferId;

      try {
        await initEbayClient();
      } catch {
        span.setAttribute("skipped", "missing-ebay-creds");
        return { success: false, reason: "missing-ebay-creds" as const };
      }

      const quantity = calculateStock({
        components: listing.components,
        inventoryParts: listing.allocatedParts,
      });
      span.setAttribute("quantity", quantity);

      const offer = await Sentry.startSpan(
        {
          name: "ebay.sell.inventory.getOffer",
          op: "http.client",
          attributes: { listingId, ebayOfferId },
        },
        async () => ebay.sell.inventory.getOffer(ebayOfferId),
      );
      offer.availableQuantity = quantity;
      await Sentry.startSpan(
        {
          name: "ebay.sell.inventory.updateOffer",
          op: "http.client",
          attributes: { listingId, ebayOfferId, quantity },
        },
        async () => ebay.sell.inventory.updateOffer(ebayOfferId, offer),
      );

      return {
        success: true,
        listingId,
        quantity,
      };
    },
  );

export const syncEbayQuantitiesForListings = async (listingIds: string[]) => {
  if (listingIds.length === 0) return [];
  const unique = [...new Set(listingIds)];
  return Promise.allSettled(
    unique.map(async (listingId) => syncEbayQuantityForListing(listingId)),
  );
};
