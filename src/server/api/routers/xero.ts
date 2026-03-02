import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";
import type { TokenSet } from "xero-node";
import { XeroClient } from "xero-node";
import { db } from "~/server/db";
import { type XeroItem } from "~/server/xero/createInvoice";
import { createXeroInvoice } from "~/server/xero/createInvoice";
import { PartStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { syncEbayQuantitiesForListings } from "~/server/lib/ebay-sync";

export const xero = new XeroClient({
  clientId: process.env.XERO_CLIENT_ID!,
  clientSecret: process.env.XERO_CLIENT_SECRET!,
  redirectUris: [process.env.XERO_REDIRECT_URI!],
  scopes: process.env.XERO_SCOPES?.split(" "),
});

export const initXero = async () => {
  await xero.initialize();
  const xeroCreds = await db.xeroCreds.findFirst();
  if (!xeroCreds) throw new Error("Xero credentials not found");
  xero.setTokenSet(xeroCreds.tokenSet as TokenSet);
  const xeroTokenSet = xero.readTokenSet();

  if (xeroTokenSet.expired()) {
    const validTokenSet = await xero.refreshToken();
    const creds = await db.xeroCreds.findFirst();
    await db.xeroCreds.update({
      where: {
        id: creds?.id,
      },
      data: {
        // @ts-expect-error: bad types
        tokenSet: validTokenSet,
        refreshToken: validTokenSet.refresh_token,
      },
    });
    xero.setTokenSet(validTokenSet);
  }
  await xero.updateTenants();
  return xero;
};

export const xeroRouter = createTRPCRouter({
  // getExpiry: adminProcedure.query(async ({ ctx }) => {
  //   const creds = await ctx.prisma.xeroCreds.findFirst();
  //   const today = new Date();
  //   const tokenDate = new Date(creds?.updatedAt as Date);
  //   const expirationDate = new Date(
  //     tokenDate.getTime() + 59 * 24 * 60 * 60 * 1000,
  //   );
  //   const daysTillExpiry = Math.ceil(
  //     (expirationDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  //   );
  //   return {
  //     daysTillExpiry: daysTillExpiry,
  //   };
  // }),
  authenticate: adminProcedure.mutation(async () => {
    const consentUrl = await xero.buildConsentUrl();
    return consentUrl;
  }),
  updateTokenset: adminProcedure
    .input(
      z.object({
        url: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      try {
        const tokenSet = await xero.apiCallback(input.url);
        const creds = await ctx.db.xeroCreds.findFirst();
        if (!creds) throw new Error("Xero credentials not found");
        const updatedCreds = await ctx.db.xeroCreds.update({
          where: {
            id: creds.id,
          },
          data: {
            // @ts-expect-error: bad types
            tokenSet: tokenSet,
            refreshToken: tokenSet.refresh_token,
          },
        });
        return {
          updatedCreds,
        };
      } catch (err) {
        if (err instanceof Error) {
          return {
            error: err.message,
          };
        }
        return {
          error: "Unknown error",
        };
      }
    }),
  testXeroConnection: adminProcedure.query(async () => {
    await initXero();
    // eslint-disable-next-line
    const activeTenantId = xero.tenants[0].tenantId;
    return !!activeTenantId;
  }),
  createDirectCashOrder: adminProcedure
    .input(
      z.object({
        name: z.string().default(""),
        email: z.string().default(""),
        phone: z.string().default(""),
        shippingMethod: z.string(),
        postageCost: z.number(),
        countryCode: z.string(),
        items: z.array(
          z.object({
            partId: z.string(),
            description: z.string(),
            price: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      const subtotal = input.items.reduce((acc, item) => acc + item.price, 0);

      const partIds = input.items.map((item) => item.partId);
      const parts = await db.part.findMany({
        where: { id: { in: partIds } },
        select: {
          id: true,
          status: true,
          allocatedToListingId: true,
        },
      });

      if (parts.length !== partIds.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more parts not found.",
        });
      }

      const unavailable = parts.filter((p) => p.status !== PartStatus.AVAILABLE);
      if (unavailable.length > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more parts are not available.",
        });
      }

      const partById = new Map(parts.map((p) => [p.id, p]));

      const order = await db.$transaction(async (tx) => {
        const createdOrder = await tx.order.create({
          data: {
            name: input.name,
            email: input.email,
            shipping: Math.round(input.postageCost * 100),
            subtotal: Math.round(subtotal * 100),
            status: "PAID",
            shippingMethod: input.shippingMethod,
          },
        });

        for (const item of input.items) {
          const part = partById.get(item.partId);
          const orderItem = await tx.orderItem.create({
            data: {
              orderId: createdOrder.id,
              listingId: part?.allocatedToListingId ?? null,
              description: item.description,
              quantity: 1,
              unitPrice: item.price,
            },
          });

          await tx.orderItemPart.create({
            data: {
              orderItemId: orderItem.id,
              partId: item.partId,
            },
          });
        }

        const soldResult = await tx.part.updateMany({
          where: {
            id: { in: partIds },
            status: PartStatus.AVAILABLE,
          },
          data: {
            status: PartStatus.SOLD,
            reservedAt: null,
          },
        });

        if (soldResult.count !== partIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Inventory changed while creating order. Please retry.",
          });
        }

        return createdOrder;
      });

      const lineItemsFormatted: XeroItem[] = input.items.map((item) => ({
        description: item.description,
        quantity: 1,
        unitAmount: item.price,
        accountCode: "200",
      }));

      if (input.postageCost > 0) {
        lineItemsFormatted.push({
          description: "Shipping",
          quantity: 1,
          unitAmount: input.postageCost,
          accountCode: "210",
          lineAmount: input.postageCost,
        });
      }

      if (input.email) {
        await createXeroInvoice({
          items: lineItemsFormatted,
          customerPhone: input.phone,
          customerEmail: input.email,
          customerName: input.name,
          orderId: order.id,
          shippingAddress: { country: input.countryCode },
          shippingCost: input.postageCost,
          shippingMethod: input.shippingMethod,
        });
      }

      const affectedListingIds = parts
        .map((p) => p.allocatedToListingId)
        .filter((id): id is string => id !== null);
      if (affectedListingIds.length > 0) {
        await syncEbayQuantitiesForListings(affectedListingIds).catch((error) => {
          console.error("eBay quantity sync failed after direct cash order", error);
        });
      }

      return { success: true, orderId: order.id };
    }),
});
