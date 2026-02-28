/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import eBayApi from "ebay-api";
import { Locale, MarketplaceId } from "ebay-api/lib/enums";
import { type AuthToken } from "ebay-api/auth/oAuth2.js";
import { db } from "~/server/db";

export const ebay = eBayApi.fromEnv();
ebay.config.acceptLanguage = Locale.en_AU;
ebay.config.contentLanguage = Locale.en_AU;
ebay.config.marketplaceId = MarketplaceId.EBAY_AU;

/**
 * Load eBay credentials from DB, set them on the client, and refresh if expired.
 * Credentials are always set before any refresh attempt — fixing the
 * "Missing credentials" error after server restart.
 */
export const initEbayClient = async () => {
  const tokenRow = await db.ebayCreds.findFirst();
  if (!tokenRow) throw new Error("eBay credentials not found");

  const tokenSet = tokenRow.refreshToken as AuthToken;
  ebay.OAuth2.setCredentials(tokenSet);

  if (
    tokenSet.expires_in &&
    new Date(tokenRow.updatedAt).getTime() + tokenSet.expires_in * 1000 <
      Date.now()
  ) {
    const refreshed = (await ebay.OAuth2.refreshToken()) as AuthToken;
    await db.ebayCreds.update({
      where: { id: tokenRow.id },
      data: { refreshToken: refreshed },
    });
    ebay.OAuth2.setCredentials(refreshed);
  }
};
