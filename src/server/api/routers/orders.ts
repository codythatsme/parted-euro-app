import { z } from "zod";
import { createTRPCRouter, publicProcedure, adminProcedure } from "../trpc";
import {
  sendOrderReadyForPickupEmail,
  sendOrderShippedEmail,
} from "../../resend/resend";
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
      include: {
        orderItems: {
          include: {
            listing: {
              include: {
                images: {
                  select: {
                    url: true,
                  },
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
    .mutation(async ({ ctx, input }) => {
      // Update the order with tracking information
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

      // Send shipping email notification
      void sendOrderShippedEmail(updatedOrder);

      return updatedOrder;
    }),

  updateStatus: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
        status: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Update the order status
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

      // Send appropriate email based on status
      if (input.status === "Ready for pickup") {
        void sendOrderReadyForPickupEmail(updatedOrder);
      } else if (input.status === "SHIPPED") {
        void sendOrderShippedEmail(updatedOrder);
      }

      return updatedOrder;
    }),

  refreshAddressFromStripe: adminProcedure
    .input(
      z.object({
        orderId: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Get the order with the Stripe checkout session ID
      const order = await ctx.db.order.findUnique({
        where: { id: input.orderId },
        select: { stripeCheckoutSessionId: true },
      });

      if (!order?.stripeCheckoutSessionId) {
        throw new Error("No Stripe checkout session ID found for this order");
      }

      try {
        // Fetch the checkout session from Stripe
        const session = await stripe.checkout.sessions.retrieve(
          order.stripeCheckoutSessionId,
        );

        console.dir(session, { depth: null, colors: true });

        if (!session.shipping_details?.address) {
          throw new Error("No address found in Stripe checkout session");
        }

        // Update the order with the fresh address data from Stripe
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
    }),
});
