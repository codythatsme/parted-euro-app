import { type AuthToken } from "ebay-api/auth/oAuth2.js";
import eBayApi from "ebay-api";
import { db } from "~/server/db";
import { calculateStock } from "~/server/lib/stock";

const ebay = eBayApi.fromEnv();

const initEbayClient = async () => {
  const tokenRow = await db.ebayCreds.findFirst();
  if (!tokenRow) return false;

  const tokenSet = tokenRow.refreshToken as AuthToken;
  ebay.OAuth2.setCredentials(tokenSet);

  if (
    tokenSet.expires_in &&
    new Date(tokenRow.updatedAt).getTime() + tokenSet.expires_in * 1000 < Date.now()
  ) {
    const refreshed = (await ebay.OAuth2.refreshToken()) as AuthToken;
    await db.ebayCreds.update({
      where: {
        id: tokenRow.id,
      },
      data: {
        refreshToken: refreshed,
      },
    });
    ebay.OAuth2.setCredentials(refreshed);
  }

  return true;
};

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

  const initialized = await initEbayClient();
  if (!initialized) {
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
