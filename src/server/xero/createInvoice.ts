import { Invoice, LineAmountTypes, Address } from "xero-node";
import { sendNewOrderEmail } from "../resend/resend";
import { initXero } from "../api/routers/xero";
import { db } from "../db";
import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET!, {
  apiVersion: "2022-11-15",
});

export type XeroItem = {
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  lineAmount?: number;
};

type CreateInvoiceOptions = {
  items: XeroItem[];
  customerEmail: string;
  customerName: string;
  orderId: string;
  shippingCost?: number;
  shippingMethod?: string;
  carrier?: string;
  shippingRateId?: string;
  customerPhone: string | undefined;
  shippingAddress?: {
    line1?: string;
    line2?: string;
    city?: string;
    postal_code?: string;
    country: string;
    state?: string;
  };
};

export const createXeroInvoice = async (input: CreateInvoiceOptions) => {
  const {
    items,
    customerEmail,
    customerName,
    orderId,
    shippingAddress,
    shippingCost,
    shippingMethod,
    carrier,
    shippingRateId,
    customerPhone,
  } = input;
  const xero = await initXero();
  // eslint-disable-next-line
  const activeTenantId = xero.tenants[0].tenantId as string;

  const invoiceDate = new Date().toISOString().split("T")[0];

  const invoiceToCreate: Invoice = {
    type: Invoice.TypeEnum.ACCREC,
    contact: {
      emailAddress: customerEmail,
      name: customerName,
      addresses: [
        {
          addressType: Address.AddressTypeEnum.POBOX,
          addressLine1: shippingAddress?.line1 ?? "",
          addressLine2: shippingAddress?.line2 ?? "",
          city: shippingAddress?.city ?? "",
          postalCode: shippingAddress?.postal_code ?? "",
          country: shippingAddress?.country ?? "",
        },
      ],
    },
    date: invoiceDate,
    dueDate: invoiceDate,
    status: Invoice.StatusEnum.AUTHORISED,
    lineItems: items,
    lineAmountTypes: LineAmountTypes.Inclusive,
  };

  const createInvoiceResponse = await xero.accountingApi.createInvoices(
    activeTenantId,
    {
      invoices: [invoiceToCreate],
    },
  );

  if (!createInvoiceResponse?.body?.invoices) {
    throw new Error("No invoice created");
  }

  const payment = {
    payments: [
      {
        invoice: {
          invoiceID: createInvoiceResponse?.body?.invoices[0]?.invoiceID,
        },
        account: {
          code: process.env.XERO_BANK_ACCOUNT,
        },
        date: invoiceDate,
        amount: items.reduce(
          (acc, item) => acc + item.unitAmount * item.quantity,
          0,
        ),
      },
    ],
  };

  const invoice = createInvoiceResponse?.body?.invoices[0];

  if (!invoice) {
    throw new Error("No invoice created");
  }

  const xeroInvoiceId = invoice.invoiceID!;

  await xero.accountingApi.createPayments(activeTenantId, payment);

  const order = await db.order.update({
    where: {
      id: orderId,
    },
    data: {
      shipping: shippingCost ?? 0,
      phoneNumber: customerPhone,
      xeroInvoiceId: invoice?.invoiceNumber,
      shippingAddress: `${shippingAddress?.line1}, ${
        shippingAddress?.line2 ?? " "
      }, ${shippingAddress?.city}, ${shippingAddress?.postal_code}, ${shippingAddress?.country}`,
      shippingLine1: shippingAddress?.line1,
      shippingLine2: shippingAddress?.line2,
      shippingCity: shippingAddress?.city,
      shippingPostcode: shippingAddress?.postal_code,
      shippingCountry: shippingAddress?.country,
      shippingState: shippingAddress?.state,
      xeroInvoiceRef: invoice?.invoiceID,
      shippingMethod,
      carrier,
      shippingRateId,
    },
  });
  void sendNewOrderEmail(order.id);
  void xero.accountingApi.emailInvoice(activeTenantId, xeroInvoiceId, {});
};

export const createInvoiceFromStripeEvent = async (
  event: Stripe.Checkout.Session,
  //   Need to find how to get the right type for event
  //   event: Stripe.Event.Data.Object,
  lineItems: Stripe.LineItem[],
) => {
  try {
    const lineItemsFormatted = lineItems.map((item) => {
      return {
        description: item.description,
        quantity: item.quantity ?? 1,
        unitAmount: item.price!.unit_amount! / 100,
        accountCode: "200",
      };
    });

    let shipping;

    if (event.shipping_cost?.amount_total) {
      shipping = event.shipping_cost.amount_total / 100;
      lineItemsFormatted.push({
        description: "Shipping",
        quantity: 1,
        unitAmount: event.shipping_cost.amount_total / 100,
        accountCode: "210",
      });
    }

    const address =
      event.shipping_details!.address ?? event.shipping_details!.address!;

    await createXeroInvoice({
      items: lineItemsFormatted,
      customerEmail: event.customer_details!.email!,
      customerName: event.customer_details!.name!,
      orderId: event.metadata!.orderId!,
      customerPhone: event.customer_details?.phone ?? undefined,
      shippingAddress: {
        line1: address.line1!,
        line2: address.line2!,
        city: address.city!,
        postal_code: address.postal_code!,
        country: address.country!,
        state: address.state!,
      },
      shippingCost: shipping ?? 0,
      shippingRateId: event.shipping_cost!.shipping_rate! as string,
    });

    // update order
    const order = await db.order.findUnique({
      where: {
        id: event.metadata!.orderId!,
      },
    });

    const shippingOption = await stripe.shippingRates.retrieve(
      order!.shippingRateId!,
    );

    await db.order.update({
      where: {
        id: event.metadata!.orderId!,
      },
      data: {
        status: "Paid",
        shippingMethod: shippingOption.display_name,
        shippingLine1: address.line1!,
        shippingLine2: address.line2!,
        shippingCity: address.city!,
        shippingPostcode: address.postal_code!,
        shippingCountry: address.country!,
        shippingState: address.state!,
        stripeCheckoutSessionId: event.id,
        shippingAddress: `${address.line1!}, ${
          address.line2! ?? " "
        }, ${address.city!}, ${address.postal_code!}, ${address.country!}`,
      },
    });

    return;
  } catch (_err) {
    // write event and lineitems to db
    await db.failedOrder.create({
      data: {
        orderId: event.metadata!.orderId!,
        stripeEvent: JSON.stringify(event),
        lineItems: JSON.stringify(lineItems),
      },
    });
  }
};
