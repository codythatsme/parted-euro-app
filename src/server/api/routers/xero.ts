import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";
import type { TokenSet } from "xero-node";
import { XeroClient } from "xero-node";
import { db } from "~/server/db";
import { type XeroItem } from "~/server/xero/createInvoice";
import { createXeroInvoice } from "~/server/xero/createInvoice";
import { PartStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { calculateRequiredPartCounts, calculateStock } from "~/server/lib/stock";
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
  authenticate: adminProcedure.mutation(async ({ ctx }) => {
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
  testXeroConnection: adminProcedure.query(async ({ ctx }) => {
    await initXero();
    // eslint-disable-next-line
    const activeTenantId = xero.tenants[0].tenantId;
    return !!activeTenantId;
  }),
  createCashOrder: adminProcedure
    .input(
      z.object({
        name: z.string(),
        email: z.string(),
        phone: z.string(),
        shippingMethod: z.string(),
        postageCost: z.number(),
        countryCode: z.string(),
        items: z.array(
          z.object({
            itemId: z.string(),
            quantity: z.number(),
            price: z.number(),
          }),
        ),
      }),
    )
    .mutation(async ({ input }) => {
      try {
        // Calculate subtotal
        const subtotal = input.items.reduce(
          (acc, item) => acc + item.price * item.quantity,
          0,
        );

        const listingIds = input.items.map((item) => item.itemId);
        const listings = await db.listing.findMany({
          where: {
            id: {
              in: listingIds,
            },
          },
          select: {
            id: true,
            title: true,
            components: {
              select: {
                partDetailId: true,
                quantity: true,
              },
            },
            allocatedParts: {
              select: {
                id: true,
                partDetailsId: true,
                status: true,
              },
            },
          },
        });
        const listingsById = new Map(listings.map((listing) => [listing.id, listing]));
        if (listingsById.size !== listingIds.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "One or more listings are unavailable.",
          });
        }

        for (const item of input.items) {
          const listing = listingsById.get(item.itemId);
          if (!listing) continue;

          const stock = calculateStock({
            components: listing.components,
            inventoryParts: listing.allocatedParts.map((part) => ({
              partDetailsId: part.partDetailsId,
              status: part.status,
            })),
          });

          if (stock < item.quantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `${listing.title} is out of stock for requested quantity.`,
            });
          }
        }

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
            const listing = listingsById.get(item.itemId);
            if (!listing) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Listing not found while creating order.",
              });
            }

            const orderItem = await tx.orderItem.create({
              data: {
                listingId: item.itemId,
                quantity: item.quantity,
                unitPrice: item.price,
                orderId: createdOrder.id,
              },
            });

            const requirements = calculateRequiredPartCounts(
              listing.components.map((component) => ({
                partDetailId: component.partDetailId,
                quantity: component.quantity,
              })),
              item.quantity,
            );

            const soldPartIds: string[] = [];
            for (const requirement of requirements) {
              const candidates = await tx.part.findMany({
                where: {
                  allocatedToListingId: listing.id,
                  partDetailsId: requirement.partDetailId,
                  status: PartStatus.AVAILABLE,
                },
                orderBy: {
                  createdAt: "asc",
                },
                take: requirement.required,
                select: {
                  id: true,
                },
              });

              if (candidates.length < requirement.required) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message: `${listing.title} is out of stock for requested quantity.`,
                });
              }

              soldPartIds.push(...candidates.map((candidate) => candidate.id));
            }

            if (soldPartIds.length > 0) {
              const updateResult = await tx.part.updateMany({
                where: {
                  id: {
                    in: soldPartIds,
                  },
                  status: PartStatus.AVAILABLE,
                },
                data: {
                  status: PartStatus.SOLD,
                  reservedAt: null,
                },
              });

              if (updateResult.count !== soldPartIds.length) {
                throw new TRPCError({
                  code: "BAD_REQUEST",
                  message:
                    "Inventory changed while creating cash order. Please retry.",
                });
              }

              await tx.orderItemPart.createMany({
                data: soldPartIds.map((partId) => ({
                  orderItemId: orderItem.id,
                  partId,
                })),
                skipDuplicates: true,
              });
            }
          }

          return createdOrder;
        });

        // Format items for Xero invoice
        const lineItemsFormatted: XeroItem[] = input.items.map((item) => {
          const listing = listingsById.get(item.itemId);
          return {
            description: listing?.title ?? item.itemId,
            quantity: item.quantity,
            unitAmount: item.price,
            accountCode: "200",
          };
        });

        // Add shipping as line item if exists
        if (input.postageCost > 0) {
          lineItemsFormatted.push({
            description: "Shipping",
            quantity: 1,
            unitAmount: input.postageCost,
            accountCode: "210",
            lineAmount: input.postageCost,
          });
        }

        // Create Xero invoice
        await createXeroInvoice({
          items: lineItemsFormatted,
          customerPhone: input.phone,
          customerEmail: input.email,
          customerName: input.name,
          orderId: order.id,
          shippingAddress: {
            country: input.countryCode,
          },
          shippingCost: input.postageCost,
          shippingMethod: input.shippingMethod,
        });

        await syncEbayQuantitiesForListings(listingIds).catch((error) => {
          console.error("eBay quantity sync failed after cash order", error);
        });

        return { success: true, orderId: order.id };
      } catch (error) {
        console.error("Error creating cash order:", error);
        throw new Error("Failed to create cash order");
      }
    }),
});
