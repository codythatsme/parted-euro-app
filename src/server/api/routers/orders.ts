import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../trpc";
import {
  sendOrderReadyForPickupEmail,
  sendOrderShippedEmail,
} from "../../resend/resend";
import { orderWithItemsInclude } from "../../db/order-includes";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET!, {
  apiVersion: "2022-11-15",
});

export const ordersRouter = createTRPCRouter({
  getOrderById: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input },
        include: {
          orderItems: true,
        },
      });
      return order;
    }),

  getOrderWithItems: publicProcedure
    .input(z.string())
    .query(async ({ ctx, input }) => {
      const order = await ctx.db.order.findUnique({
        where: { id: input },
        include: {
          orderItems: {
            include: {
              listing: {
                include: {
                  images: {
                    orderBy: {
                      order: "asc",
                    },
                    take: 1,
                  },
                },
              },
              allocatedParts: {
                include: {
                  part: {
                    include: {
                      donor: {
                        select: {
                          vin: true,
                        },
                      },
                      inventoryLocation: {
                        select: {
                          id: true,
                          name: true,
                        },
                      },
                      partDetails: {
                        select: {
                          partNo: true,
                          name: true,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
      return order;
    }),

  // Admin procedures for the orders management panel
  getAllAdmin: adminProcedure.query(async ({ ctx }) => {
    // Get all orders except PENDING
    const orders = await ctx.db.order.findMany({
      where: {
        status: {
          not: "PENDING",
        },
      },
      orderBy: [{ createdAt: "desc" }],
      include: orderWithItemsInclude,
    });

    return {
      items: orders.map((order) => {
        return {
          ...order,
          subtotal: (order.subtotal ?? 0) / 100,
          shipping: (order.shipping ?? 0) / 100,
        };
      }),
    };
  }),

  updateTracking: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        trackingNumber: z.string(),
        carrier: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      Sentry.startSpan(
        {
          name: "orders.updateTracking",
          op: "function",
          attributes: {
            orderId: input.orderId,
            carrier: input.carrier ?? "unknown",
          },
        },
        async () => {
          const updatedOrder = await ctx.db.order.update({
            where: { id: input.orderId },
            data: {
              trackingNumber: input.trackingNumber,
              carrier: input.carrier,
              // If adding tracking, typically this means it's been shipped
              status: "SHIPPED",
            },
            include: {
              orderItems: {
                include: {
                  listing: {
                    include: {
                      images: {
                        orderBy: {
                          order: "asc",
                        },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          });

          void Sentry.startSpan(
            {
              name: "resend.sendOrderShippedEmail",
              op: "http.client",
              attributes: { orderId: input.orderId },
            },
            async () => sendOrderShippedEmail(updatedOrder),
          );

          return updatedOrder;
        },
      ),
    ),

  updateStatus: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      Sentry.startSpan(
        {
          name: "orders.updateStatus",
          op: "function",
          attributes: { orderId: input.orderId, newStatus: input.status },
        },
        async () => {
          const updatedOrder = await ctx.db.order.update({
            where: { id: input.orderId },
            data: {
              status: input.status,
            },
            include: {
              orderItems: {
                include: {
                  listing: {
                    include: {
                      images: {
                        orderBy: {
                          order: "asc",
                        },
                        take: 1,
                      },
                    },
                  },
                },
              },
            },
          });

          if (input.status === "Ready for pickup") {
            void Sentry.startSpan(
              {
                name: "resend.sendOrderReadyForPickupEmail",
                op: "http.client",
                attributes: { orderId: input.orderId },
              },
              async () => sendOrderReadyForPickupEmail(updatedOrder),
            );
          } else if (input.status === "SHIPPED") {
            void Sentry.startSpan(
              {
                name: "resend.sendOrderShippedEmail",
                op: "http.client",
                attributes: { orderId: input.orderId },
              },
              async () => sendOrderShippedEmail(updatedOrder),
            );
          }

          return updatedOrder;
        },
      ),
    ),

  refreshAddressFromStripe: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) =>
      Sentry.startSpan(
        {
          name: "orders.refreshAddress",
          op: "function",
          attributes: { orderId: input.orderId },
        },
        async (rootSpan) => {
          const order = await ctx.db.order.findUnique({
            where: { id: input.orderId },
            select: { stripeCheckoutSessionId: true },
          });

          if (!order?.stripeCheckoutSessionId) {
            throw new Error(
              "No Stripe checkout session ID found for this order",
            );
          }

          const stripeSessionId = order.stripeCheckoutSessionId;
          rootSpan.setAttribute("stripeSessionId", stripeSessionId);

          try {
            const session = await Sentry.startSpan(
              {
                name: "stripe.checkout.sessions.retrieve",
                op: "http.client",
                attributes: {
                  orderId: input.orderId,
                  stripeSessionId,
                },
              },
              async () => stripe.checkout.sessions.retrieve(stripeSessionId),
            );

            console.dir(session, { depth: null, colors: true });

            if (!session.shipping_details?.address) {
              throw new Error("No address found in Stripe checkout session");
            }

            const updatedOrder = await ctx.db.order.update({
              where: { id: input.orderId },
              data: {
                shippingLine1: session.shipping_details.address.line1,
                shippingLine2: session.shipping_details.address.line2,
                shippingCity: session.shipping_details.address.city,
                shippingPostcode: session.shipping_details.address.postal_code,
                shippingCountry: session.shipping_details.address.country,
                shippingState: session.shipping_details.address.state,
                shippingAddress: `${session.shipping_details.address.line1}, ${
                  session.shipping_details.address.line2 ?? " "
                }, ${session.shipping_details.address.city}, ${session.shipping_details.address.postal_code}, ${session.shipping_details.address.country}`,
              },
            });

            return updatedOrder;
          } catch (error) {
            throw new Error(
              `Failed to refresh address from Stripe: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }
        },
      ),
    ),
});
