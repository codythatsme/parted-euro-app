/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { type Prisma } from "@prisma/client";
import eBayApi from "ebay-api";
import { Locale, MarketplaceId } from "ebay-api/lib/enums";
import { type AuthToken } from "ebay-api/auth/oAuth2.js";
import { env } from "~/env";
import { db } from "~/server/db";

export const ebay = eBayApi.fromEnv();
ebay.config.acceptLanguage = Locale.en_AU;
ebay.config.contentLanguage = Locale.en_AU;
ebay.config.marketplaceId = MarketplaceId.EBAY_AU;

const ACCESS_TOKEN_REFRESH_BUFFER_MS = 2 * 60 * 1000;

let refreshPersistenceRegistered = false;

const getEbayScopes = () => {
  const scopes = env.EBAY_SCOPES.split(/\s+/).filter(Boolean);
  if (scopes.length === 0) {
    throw new Error("EBAY_SCOPES must contain at least one eBay OAuth scope");
  }
  return scopes;
};

const setEbayScopes = () => {
  ebay.OAuth2.setScope(getEbayScopes());
};

const tokenAsJson = (token: AuthToken) =>
  token as unknown as Prisma.InputJsonValue;

export const saveEbayAuthToken = async (token: AuthToken) => {
  const existing = await db.ebayCreds.findFirst({
    orderBy: { updatedAt: "desc" },
  });

  if (!existing) {
    return db.ebayCreds.create({
      data: {
        refreshToken: tokenAsJson(token),
      },
    });
  }

  return db.ebayCreds.update({
    where: { id: existing.id },
    data: {
      refreshToken: tokenAsJson(token),
    },
  });
};

const registerRefreshPersistence = () => {
  if (refreshPersistenceRegistered) return;
  refreshPersistenceRegistered = true;

  ebay.OAuth2.on("refreshAuthToken", (token: AuthToken) => {
    void saveEbayAuthToken(token).catch((error: unknown) => {
      console.error("Failed to persist refreshed eBay OAuth token", error);
    });
  });
};

registerRefreshPersistence();

const isAccessTokenExpired = (token: AuthToken, updatedAt: Date) => {
  if (!token.expires_in) return false;

  return (
    updatedAt.getTime() +
      token.expires_in * 1000 -
      ACCESS_TOKEN_REFRESH_BUFFER_MS <=
    Date.now()
  );
};

/**
 * Load eBay credentials from DB, set them on the client, and refresh if expired.
 * Credentials are always set before any refresh attempt — fixing the
 * "Missing credentials" error after server restart.
 */
export const initEbayClient = async () => {
  setEbayScopes();

  const tokenRow = await db.ebayCreds.findFirst({
    orderBy: { updatedAt: "desc" },
  });
  if (!tokenRow) throw new Error("eBay credentials not found");

  const tokenSet = tokenRow.refreshToken as AuthToken;
  if (!tokenSet.refresh_token) {
    throw new Error("eBay refresh token missing; reconnect the eBay account");
  }

  ebay.OAuth2.setCredentials(tokenSet);

  if (isAccessTokenExpired(tokenSet, tokenRow.updatedAt)) {
    const refreshed = (await ebay.OAuth2.refreshToken()) as AuthToken;
    await saveEbayAuthToken(refreshed);
    ebay.OAuth2.setCredentials(refreshed);
  }

  return ebay;
};

export const getEbayAuthUrl = () => {
  setEbayScopes();
  return ebay.OAuth2.generateAuthUrl();
};

export const exchangeEbayAuthCode = async (code: string) => {
  setEbayScopes();
  const token = (await ebay.OAuth2.getToken(code)) as AuthToken;
  const updatedCreds = await saveEbayAuthToken(token);
  ebay.OAuth2.setCredentials(token);

  return updatedCreds;
};
