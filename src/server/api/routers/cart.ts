import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { calculateStock } from "~/server/lib/stock";

// Helper to read device id from request headers
function getDeviceIdFromHeaders(headers: Headers): string {
  const deviceId = headers.get("x-device-id")?.trim();
  if (!deviceId) {
    throw new Error("Missing x-device-id header");
  }
  // very basic validation to avoid too-long values
  if (deviceId.length > 200) {
    throw new Error("Invalid device id");
  }
  return deviceId;
}

export const cartRouter = createTRPCRouter({
  // Return full cart with listing details
  getCart: publicProcedure.query(async ({ ctx }) => {
    const deviceId = getDeviceIdFromHeaders(ctx.headers);

    // Ensure cart exists
    await ctx.db.cart.upsert({
      where: { deviceId },
      create: { deviceId },
      update: {},
    });

    const items = await ctx.db.cartItem.findMany({
      where: { cartId: deviceId },
      include: {
        listing: {
          select: {
            id: true,
            title: true,
            price: true,
            images: {
              orderBy: { order: "asc" },
              take: 1,
              select: { url: true },
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    return items.map((item) => ({
      listingId: item.listingId,
      quantity: item.quantity,
      title: item.listing.title,
      price: item.listing.price,
      imageUrl: item.listing.images[0]?.url ?? null,
    }));
  }),

  // Lightweight summary
  getCartSummary: publicProcedure.query(async ({ ctx }) => {
    const deviceId = getDeviceIdFromHeaders(ctx.headers);
    const items = await ctx.db.cartItem.findMany({
      where: { cartId: deviceId },
      select: { quantity: true, listing: { select: { price: true } } },
    });
    const count = items.reduce((n, i) => n + i.quantity, 0);
    const subtotal = items.reduce(
      (sum, i) => sum + (i.listing.price ?? 0) * i.quantity,
      0,
    );
    return { count, subtotal };
  }),

  addItem: publicProcedure
    .input(
      z.object({ listingId: z.string(), quantity: z.number().int().min(1) }),
    )
    .mutation(async ({ ctx, input }) => {
      const deviceId = getDeviceIdFromHeaders(ctx.headers);

      const listing = await ctx.db.listing.findFirst({
        where: {
          id: input.listingId,
          active: true,
        },
        select: {
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
      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      await ctx.db.cart.upsert({
        where: { deviceId },
        create: { deviceId },
        update: {},
      });

      // upsert by unique (cartId, listingId)
      const existing = await ctx.db.cartItem.findUnique({
        where: {
          cartId_listingId: { cartId: deviceId, listingId: input.listingId },
        },
        select: { id: true, quantity: true },
      });
      const nextQuantity = (existing?.quantity ?? 0) + input.quantity;
      const stock = calculateStock({
        components: listing.components,
        inventoryParts: listing.allocatedParts,
      });
      if (nextQuantity > stock) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Not enough stock for requested quantity.",
        });
      }

      if (existing) {
        await ctx.db.cartItem.update({
          where: { id: existing.id },
          data: { quantity: existing.quantity + input.quantity },
        });
      } else {
        await ctx.db.cartItem.create({
          data: {
            cartId: deviceId,
            listingId: input.listingId,
            quantity: input.quantity,
          },
        });
      }

      return { ok: true };
    }),

  updateItem: publicProcedure
    .input(
      z.object({ listingId: z.string(), quantity: z.number().int().min(1) }),
    )
    .mutation(async ({ ctx, input }) => {
      const deviceId = getDeviceIdFromHeaders(ctx.headers);
      await ctx.db.cartItem.update({
        where: {
          cartId_listingId: { cartId: deviceId, listingId: input.listingId },
        },
        data: { quantity: input.quantity },
      });
      return { ok: true };
    }),

  removeItem: publicProcedure
    .input(z.object({ listingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const deviceId = getDeviceIdFromHeaders(ctx.headers);
      await ctx.db.cartItem.delete({
        where: {
          cartId_listingId: { cartId: deviceId, listingId: input.listingId },
        },
      });
      return { ok: true };
    }),

  clear: publicProcedure.mutation(async ({ ctx }) => {
    const deviceId = getDeviceIdFromHeaders(ctx.headers);
    await ctx.db.cartItem.deleteMany({ where: { cartId: deviceId } });
    return { ok: true };
  }),

  // Keep existing helper endpoints for shipping calculations
  getListingsByIds: publicProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) return [];
      const listings = await ctx.db.listing.findMany({
        where: { id: { in: input.ids } },
        select: {
          id: true,
          title: true,
          price: true,
          images: { orderBy: { order: "asc" }, take: 1, select: { url: true } },
        },
      });
      return listings;
    }),

  getCartShippingData: publicProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .query(async ({ ctx, input }) => {
      const listings = await ctx.db.listing.findMany({
        where: { id: { in: input.ids } },
        select: {
          components: {
            select: {
              quantity: true,
              partDetail: {
                select: {
                  length: true,
                  width: true,
                  height: true,
                  weight: true,
                },
              },
            },
          },
        },
      });
      const cartParts = listings.flatMap((listing) =>
        listing.components.flatMap((component) =>
          Array.from({ length: component.quantity }, () => component.partDetail),
        ),
      );
      const cartWeight = cartParts.reduce((acc, cur) => acc + cur.weight, 0);
      const largestPart = cartParts.reduce(
        (acc, cur) =>
          acc.length * acc.width * acc.height >
          cur.length * cur.width * cur.height
            ? acc
            : cur,
        { length: 0, width: 0, height: 0, weight: 0 },
      );
      return { largestPart, cartWeight };
    }),
});
