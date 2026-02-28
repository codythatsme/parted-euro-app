import { db } from "~/server/db";
import { calculateStock } from "~/server/lib/stock";
import { ebay, initEbayClient } from "~/server/lib/ebay-client";

export const syncEbayQuantityForListing = async (listingId: string) => {
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
    return { success: false, reason: "listing-not-linked" as const };
  }

  try {
    await initEbayClient();
  } catch {
    return { success: false, reason: "missing-ebay-creds" as const };
  }

  const quantity = calculateStock({
    components: listing.components,
    inventoryParts: listing.allocatedParts,
  });

  const offer = await ebay.sell.inventory.getOffer(listing.ebayOfferId);
  offer.availableQuantity = quantity;
  await ebay.sell.inventory.updateOffer(listing.ebayOfferId, offer);

  return {
    success: true,
    listingId,
    quantity,
  };
};

export const syncEbayQuantitiesForListings = async (listingIds: string[]) => {
  if (listingIds.length === 0) return [];
  const unique = [...new Set(listingIds)];
  return Promise.allSettled(
    unique.map(async (listingId) => syncEbayQuantityForListing(listingId)),
  );
};
