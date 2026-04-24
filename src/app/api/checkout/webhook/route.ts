import { type NextRequest } from "next/server";
import { PartStatus } from "@prisma/client";
import Stripe from "stripe";
import * as Sentry from "@sentry/nextjs";
import { createInvoiceFromStripeEvent } from "~/server/xero/createInvoice";
import { db } from "~/server/db";
import { syncEbayQuantitiesForListings } from "~/server/lib/ebay-sync";

export const maxDuration = 30;

export const POST = async (req: NextRequest) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET!, {
    apiVersion: "2022-11-15",
  });

  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return new Response("No signature provided", { status: 400 });
  }

  const body = await req.text();
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`Webhook signature verification failed: ${errorMessage}`);
    Sentry.captureException(err, {
      tags: { flow: "webhook", step: "verifySignature" },
    });
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  return Sentry.startSpan(
    {
      name: "webhook.stripe.event",
      op: "function",
      attributes: {
        stripeEventType: event.type,
        stripeEventId: event.id,
      },
    },
    async (rootSpan) => {
      // Handle the event
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const orderId = session.metadata?.orderId;
          if (!orderId) {
            return new Response("Missing orderId metadata", { status: 400 });
          }
          rootSpan.setAttribute("orderId", orderId);
          rootSpan.setAttribute("stripeSessionId", session.id);

          const orderItems = await db.orderItem.findMany({
            where: {
              orderId,
            },
            select: {
              listingId: true,
              allocatedParts: {
                select: {
                  partId: true,
                },
              },
            },
          });

          const reservedPartIds = orderItems.flatMap((item) =>
            item.allocatedParts.map((part) => part.partId),
          );

          if (reservedPartIds.length > 0) {
            await Sentry.startSpan(
              {
                name: "webhook.markPartsSold",
                op: "db",
                attributes: { orderId, partCount: reservedPartIds.length },
              },
              async () =>
                db.part.updateMany({
                  where: {
                    id: {
                      in: reservedPartIds,
                    },
                    status: PartStatus.RESERVED,
                  },
                  data: {
                    status: PartStatus.SOLD,
                    reservedAt: null,
                  },
                }),
            );
          }

          const completedListingIds = orderItems
            .map((item) => item.listingId)
            .filter((id): id is string => id !== null);
          if (completedListingIds.length > 0) {
            await Sentry.startSpan(
              {
                name: "webhook.ebay.syncAfterCompletion",
                op: "http.client",
                attributes: {
                  orderId,
                  listingCount: completedListingIds.length,
                },
              },
              async () =>
                syncEbayQuantitiesForListings(completedListingIds).catch(
                  (error) => {
                    console.error(
                      "eBay quantity sync failed after checkout completion",
                      error,
                    );
                    Sentry.captureException(error, {
                      tags: {
                        flow: "webhook",
                        step: "ebay.syncAfterCompletion",
                      },
                      extra: { orderId, listingIds: completedListingIds },
                    });
                  },
                ),
            );
          }

          const lineItems = await Sentry.startSpan(
            {
              name: "webhook.stripe.listLineItems",
              op: "http.client",
              attributes: { orderId, stripeSessionId: session.id },
            },
            async () =>
              stripe.checkout.sessions.listLineItems(session.id, {
                expand: ["data.price.product"],
              }),
          );

          await Sentry.startSpan(
            {
              name: "webhook.xero.createInvoice",
              op: "function",
              attributes: { orderId, lineItemCount: lineItems.data.length },
            },
            async () => createInvoiceFromStripeEvent(session, lineItems.data),
          );
          break;
        }
        case "checkout.session.expired": {
          const session = event.data.object as Stripe.Checkout.Session;
          const orderId = session.metadata?.orderId;
          if (!orderId) {
            return new Response("Missing orderId metadata", { status: 400 });
          }
          rootSpan.setAttribute("orderId", orderId);
          rootSpan.setAttribute("stripeSessionId", session.id);

          const orderItems = await db.orderItem.findMany({
            where: {
              orderId,
            },
            select: {
              listingId: true,
              allocatedParts: {
                select: {
                  partId: true,
                },
              },
            },
          });

          const reservedPartIds = orderItems.flatMap((item) =>
            item.allocatedParts.map((part) => part.partId),
          );

          if (reservedPartIds.length > 0) {
            await Sentry.startSpan(
              {
                name: "webhook.releaseParts",
                op: "db",
                attributes: { orderId, partCount: reservedPartIds.length },
              },
              async () =>
                db.part.updateMany({
                  where: {
                    id: {
                      in: reservedPartIds,
                    },
                    status: PartStatus.RESERVED,
                  },
                  data: {
                    status: PartStatus.AVAILABLE,
                    reservedAt: null,
                  },
                }),
            );
          }

          const expiredListingIds = orderItems
            .map((item) => item.listingId)
            .filter((id): id is string => id !== null);
          if (expiredListingIds.length > 0) {
            await Sentry.startSpan(
              {
                name: "webhook.ebay.syncAfterExpiry",
                op: "http.client",
                attributes: {
                  orderId,
                  listingCount: expiredListingIds.length,
                },
              },
              async () =>
                syncEbayQuantitiesForListings(expiredListingIds).catch(
                  (error) => {
                    console.error(
                      "eBay quantity sync failed after checkout expiry",
                      error,
                    );
                    Sentry.captureException(error, {
                      tags: { flow: "webhook", step: "ebay.syncAfterExpiry" },
                      extra: { orderId, listingIds: expiredListingIds },
                    });
                  },
                ),
            );
          }

          await Sentry.startSpan(
            {
              name: "webhook.order.markExpired",
              op: "db",
              attributes: { orderId },
            },
            async () =>
              db.order.updateMany({
                where: {
                  id: orderId,
                  status: "PENDING",
                },
                data: {
                  status: "EXPIRED",
                },
              }),
          );
          break;
        }
        default:
          // Unexpected event type
          console.log(`Unhandled event type: ${event.type}`);
      }

      return new Response(JSON.stringify({ received: true }), { status: 200 });
    },
  );
};
