import { type NextRequest } from "next/server";
import { PartStatus } from "@prisma/client";
import Stripe from "stripe";
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
    return new Response(`Webhook Error: ${errorMessage}`, { status: 400 });
  }

  // Handle the event
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) {
        return new Response("Missing orderId metadata", { status: 400 });
      }

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
        await db.part.updateMany({
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
        });
      }

      await syncEbayQuantitiesForListings(orderItems.map((item) => item.listingId)).catch(
        (error) => {
          console.error("eBay quantity sync failed after checkout completion", error);
        },
      );

      const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
        expand: ["data.price.product"],
      });

      await createInvoiceFromStripeEvent(session, lineItems.data);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      if (!orderId) {
        return new Response("Missing orderId metadata", { status: 400 });
      }

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
        await db.part.updateMany({
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
        });
      }

      await syncEbayQuantitiesForListings(orderItems.map((item) => item.listingId)).catch(
        (error) => {
          console.error("eBay quantity sync failed after checkout expiry", error);
        },
      );

      await db.order.updateMany({
        where: {
          id: orderId,
          status: "PENDING",
        },
        data: {
          status: "EXPIRED",
        },
      });
      break;
    }
    default:
      // Unexpected event type
      console.log(`Unhandled event type: ${event.type}`);
  }

  return new Response(JSON.stringify({ received: true }), { status: 200 });
};
