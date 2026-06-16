import { Stripe } from "stripe";
import { z } from "zod";
import * as Sentry from "@sentry/nextjs";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";
import { db } from "~/server/db";
import { calculateStock, SELLABLE_PART_STATUSES } from "~/server/lib/stock";
// import { createStripeSession } from "@/pages/api/checkout";

type ShippingCountryResponse = {
  countries: Record<"country", AusPostShippingCodes[]>;
};

type AusPostShippingCodes = {
  code: string;
  name: string;
};

type AvailableShippingServicesResponse = {
  services: {
    service: AusPostShippingService[];
  };
};

type AusPostShippingService = {
  code: string;
  name: string;
  price: string;
  max_extra_cover: number;
  options: {
    option: {
      code: string;
      name: string;
    }[];
  };
};

export type StripeShippingOption = {
  shipping_rate_data: {
    type: string;
    display_name: string;
    fixed_amount: {
      amount: number;
      currency: string;
    };
  };
};

type InterparcelShippingServicesResponse = {
  status: number;
  errorMessage: string;
  services: InterparcelShippingService[];
  invalidServices: never[];
};

type InterparcelShippingService = {
  id: string;
  service: string;
  type: string;
  rapid: {
    quote: string;
    pickup: string;
    transitTimes: string;
  };
};

type InterparcelShippingQuote = {
  status: number;
  shipment: {
    collCountry: string;
    delCountry: string;
  };
  services: {
    id: string;
    service: string;
    carrier: string;
    name: string;
    displayCarrier: string;
    displayName: string;
    realCarrier: string;
    bulkCarrier: string;
    logoImage: string;
    carrierDescription: string;
    description: string;
    warning: string;
    type: string;
    category: string;
    transitCover: number;
    maxTransitCover: number;
    transitCoverPercent: number;
    collAddressType: string;
    delAddressType: string;
    ofdNotifications: string;
    delNotifications: string;
    signature: string;
    signatureSell: number;
    printInStore: null;
    manifestRequired: boolean;
    volumetricWeights: string[];
    printerRequired: boolean;
    maxWeight: number;
    maxLength: number;
    sellPrice: number;
    taxable: string;
    invoiceRequired: string;
    hsCodeRequired: string;
    remote: {
      collection: {
        remote: boolean;
        message: string;
      };
      delivery: {
        remote: boolean;
        price: number;
      };
    };
    pickupDates: {
      status: number;
      pickupType: string;
      dateNow: string;
      timeNow: string;
      cutoffDate: string;
      cutoffTime: string;
      dates: string[];
      window: {
        earliestFrom: string;
        earliestTo: string;
        latestFrom: string;
        latestTo: string;
        minimumWindow: number;
      };
      cached: boolean;
    };
    timeElapsed: number;
  }[];
  invalidServices: never[];
};

const getShippingServicesInputSchema = z.object({
  weight: z.number(),
  length: z.number(),
  width: z.number(),
  height: z.number(),
  destinationCountry: z.string(),
  destinationPostcode: z.string().optional(),
  destinationCity: z.string().optional(),
  destinationState: z.string().optional(),
  b2b: z.boolean(),
});

type ShippingServicesInput = z.infer<typeof getShippingServicesInputSchema>;

// auspost vatiables
const auspostBaseUrl = "https://digitalapi.auspost.com.au";
const supportedShippingMethods = ["Standard", "Express"];

// interparcel variables
const interparcelBaseUrl = "https://au.interparcel.com/api";

const partedEuroAddress = {
  addrOne: "26 Rushdale Street",
  addrTwo: "2",
  postcode: "3180",
  city: "Knoxfield",
  state: "VIC",
  country: "AU",
};

const parseSetCookieHeaders = (headers: Headers): string[] => {
  const anyHeaders = headers as unknown as { getSetCookie?: () => string[] };
  const arr = anyHeaders.getSetCookie?.();
  if (arr && Array.isArray(arr)) return arr;
  const single = headers.get("set-cookie");
  if (!single) return [];
  // Split cookie pairs; keep commas inside attribute values like Expires
  return single.split(/,(?=[^;]+=[^;]+)/g);
};

const pickupShippingOption = {
  shipping_rate_data: {
    type: "fixed_amount",
    fixed_amount: { amount: 0, currency: "aud" },
    display_name: "Pickup from Parted Euro",
  },
};

const adminShippingOption = {
  shipping_rate_data: {
    type: "fixed_amount",
    fixed_amount: { amount: 1, currency: "aud" },
    display_name: "Admin Shipping",
  },
};

const getDomesticShippingServices = async (input: ShippingServicesInput) => {
  const { weight, length, width, height, destinationPostcode } = input;
  const ausPostRes = await fetch(
    `https://digitalapi.auspost.com.au/postage/parcel/domestic/service.json?length=${length}&width=${width}&height=${height}&weight=${weight}&from_postcode=${partedEuroAddress.postcode}&to_postcode=${destinationPostcode}`,
    {
      method: "GET",
      headers: {
        "AUTH-KEY": process.env.AUSPOST_API_KEY!,
      },
    },
  );
  const data = (await ausPostRes.json()) as AvailableShippingServicesResponse;
  const express = data.services.service.find(
    (service) => service.code === "AUS_PARCEL_EXPRESS",
  )?.price;
  const regular = data.services.service.find(
    (service) => service.code === "AUS_PARCEL_REGULAR",
  )?.price;
  if (!express || !regular) throw new Error("Shipping not available");
  return [
    {
      shipping_rate_data: {
        type: "fixed_amount",
        fixed_amount: {
          amount: Math.ceil(Number(regular) * 100),
          currency: "AUD",
        },
        display_name: "AusPost Regular",
      },
    },
    {
      shipping_rate_data: {
        type: "fixed_amount",
        fixed_amount: {
          amount: Math.ceil(Number(express) * 100),
          currency: "AUD",
        },
        display_name: "AusPost Express",
      },
    },
  ];
};

const getAusPostInternationalShippingServices = async (
  input: ShippingServicesInput,
) => {
  const { destinationCountry, weight } = input;
  const res = await fetch(
    `${auspostBaseUrl}/postage/parcel/international/service.json?country_code=${destinationCountry}&weight=${weight}`,
    {
      headers: {
        "AUTH-KEY": process.env.AUSPOST_API_KEY!,
      },
    },
  );
  const data = (await res.json()) as AvailableShippingServicesResponse;
  return data.services.service
    .map((service) => {
      return {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: Math.ceil(Number(service.price) * 100),
            currency: "AUD",
          },
          display_name: service.name,
        },
      };
    })
    .filter((service) =>
      supportedShippingMethods.includes(
        service.shipping_rate_data.display_name,
      ),
    );
};

const getInterparcelShippingServices = async (input: ShippingServicesInput) => {
  const {
    length,
    width,
    height,
    destinationPostcode,
    destinationCountry,
    destinationCity,
    destinationState,
    weight,
    b2b,
  } = input;
  const interparcelParams =
    weight > 35
      ? {
          "pkg[0][0]": weight.toString(),
          "pkg[0][1]": (length + 30).toString(),
          "pkg[0][2]": (width + 30).toString(),
          "pkg[0][3]": (height + 10).toString(),
          source: "booking",
          coll_country: "Australia",
          coll_state: partedEuroAddress.state,
          coll_city: partedEuroAddress.city,
          coll_postcode: partedEuroAddress.postcode,
          del_postcode: destinationPostcode ?? "",
          del_city: destinationCity ?? "",
          del_state: destinationState ?? "",
          del_country: destinationCountry,
        }
      : {
          source: "booking",
          coll_country: "Australia",
          coll_state: partedEuroAddress.state,
          coll_city: partedEuroAddress.city,
          coll_postcode: partedEuroAddress.postcode,
          del_postcode: destinationPostcode ?? "",
          del_city: destinationCity ?? "",
          del_state: destinationState ?? "",
          del_country: destinationCountry,
          "pkg[0][0]": weight.toString(),
          "pkg[0][1]": length.toString(),
          "pkg[0][2]": width.toString(),
          "pkg[0][3]": height.toString(),
        };

  const searchParams = new URLSearchParams({
    ...interparcelParams,
    type: weight >= 35 ? "pallet" : "parcel",
  });
  const shippingServicesAvailableResponse = await fetch(
    `${interparcelBaseUrl}/quote/availability?${searchParams.toString()}`,
  );
  const shippingServicesAvailableData =
    (await shippingServicesAvailableResponse.json()) as InterparcelShippingServicesResponse;

  if (shippingServicesAvailableData.errorMessage) {
    throw new Error(shippingServicesAvailableData.errorMessage);
  }

  // Initialize session by visiting quote page, collect Set-Cookie (PHPSESSID) and CSRF token
  const quotePageParams = new URLSearchParams({
    p: `${weight}|${length}|${width}|${height}`,
    t: weight >= 35 ? "pallet" : "parcel",
    ct: partedEuroAddress.city,
    cs: partedEuroAddress.state,
    cp: partedEuroAddress.postcode,
    cc: "Australia",
    dt: destinationCity ?? "",
    ds: destinationState ?? "",
    dp: destinationPostcode ?? "",
    dc: destinationCountry,
  });
  const cookieJar: Record<string, string> = {};
  let nextUrl = `https://au.interparcel.com/quote/select-service?${quotePageParams.toString()}`;
  let quotePageHtml = "";
  for (let i = 0; i < 5; i++) {
    const res = await fetch(nextUrl, {
      method: "GET",
      redirect: "manual",
      cache: "no-store",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
          "(KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        ...(Object.keys(cookieJar).length
          ? {
              Cookie: Object.entries(cookieJar)
                .map(([k, v]) => `${k}=${v}`)
                .join("; "),
            }
          : {}),
      },
    });
    for (const sc of parseSetCookieHeaders(res.headers)) {
      const split = sc.split(";").map((p) => p.trim());
      const first = split[0];
      if (!first) continue;
      const eq = first.indexOf("=");
      if (eq > 0) {
        const name = first.slice(0, eq);
        const value = first.slice(eq + 1);
        if (name && value !== undefined) cookieJar[name] = value;
      }
    }
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      nextUrl = new URL(loc, nextUrl).toString();
      continue;
    }
    quotePageHtml = await res.text();
    break;
  }

  const phpSessId =
    cookieJar.PHPSESSID ??
    cookieJar.phpsessid ??
    cookieJar.PhpSessId ??
    (cookieJar as Record<string, string>)["phpsessionid"];
  if (!phpSessId) {
    throw new Error("PHPSESSID not found in Interparcel response");
  }
  const cookieHeader = Object.entries(cookieJar)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");

  // Extract CSRF token from HTML
  let csrfToken: string | undefined;
  const metaMatch = quotePageHtml.match(
    /<meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i,
  );
  if (metaMatch) {
    csrfToken = metaMatch[1];
  }
  if (!csrfToken) {
    throw new Error("Failed to obtain CSRF token from Interparcel");
  }

  const afterHunterFilter = shippingServicesAvailableData.services.filter(
    (service) => !service.service.includes("Hunter"),
  );

  const b2bFilteredCount = b2b
    ? 0
    : afterHunterFilter.filter((s) => s.service.toLowerCase().includes("b2b"))
        .length;

  const servicesToQuote = afterHunterFilter.filter((service) => {
    if (b2b) return true;
    return !service.service.toLowerCase().includes("b2b");
  });

  const requests = servicesToQuote.map(async (service) => {
    try {
      const searchParams = new URLSearchParams({
        ...interparcelParams,
        service: service.id,
      });
      const response = await fetch(
        `${interparcelBaseUrl}/quote/quote?${searchParams.toString()}`,
        {
          headers: {
            Cookie: cookieHeader,
            "x-csrf-token": csrfToken!,
          },
        },
      );

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as InterparcelShippingQuote;

      if (!data.services?.length) {
        return null;
      }
      return {
        shipping_rate_data: {
          type: "fixed_amount",
          fixed_amount: {
            amount: Math.ceil(Number(data.services[0]!.sellPrice) * 100),
            currency: "AUD",
          },
          display_name: `${data.services[0]!.carrier} - ${
            data.services[0]!.name
          }`,
        },
      };
    } catch (error) {
      return null;
    }
  });
  const availableServices = await Promise.allSettled(requests);
  const validServices = availableServices
    .filter((result) => result.status === "fulfilled" && result.value !== null)
    .map(
      (result) =>
        (result as PromiseFulfilledResult<StripeShippingOption>).value,
    ) as StripeShippingOption[];

  if (!validServices.length && b2bFilteredCount === 0) {
    throw new Error("Unable to ship this item to the destination country");
  }
  return { services: validServices.slice(0, 4), b2bFilteredCount };
};

export type CheckoutItem = {
  itemId: string;
  quantity: number;
};

const checkoutItemSchema = z.object({
  itemId: z.string(),
  quantity: z.number().int().min(1),
});

const normalizeCheckoutItems = (items: CheckoutItem[]): CheckoutItem[] => {
  const requestedByListingId = new Map<string, number>();

  for (const item of items) {
    requestedByListingId.set(
      item.itemId,
      (requestedByListingId.get(item.itemId) ?? 0) + item.quantity,
    );
  }

  return Array.from(requestedByListingId, ([itemId, quantity]) => ({
    itemId,
    quantity,
  }));
};

const validateCheckoutStock = async (items: CheckoutItem[]) => {
  const normalizedItems = normalizeCheckoutItems(items);
  const listings = await db.listing.findMany({
    where: {
      id: {
        in: normalizedItems.map((item) => item.itemId),
      },
      active: true,
    },
    select: {
      id: true,
      title: true,
      price: true,
      images: {
        orderBy: {
          order: "asc",
        },
      },
      components: {
        select: {
          partDetailId: true,
          quantity: true,
        },
      },
      allocatedParts: {
        where: {
          status: {
            in: SELLABLE_PART_STATUSES,
          },
        },
        select: {
          id: true,
          partDetailsId: true,
          status: true,
          createdAt: true,
          inventoryLocation: { select: { name: true } },
        },
      },
    },
  });

  const listingById = new Map(listings.map((listing) => [listing.id, listing]));
  const results = normalizedItems.map((item) => {
    const listing = listingById.get(item.itemId);

    if (!listing) {
      return {
        listingId: item.itemId,
        title: "Unavailable item",
        requested: item.quantity,
        available: 0,
        ok: false,
      };
    }

    const available = calculateStock({
      components: listing.components,
      inventoryParts: listing.allocatedParts,
    });

    return {
      listingId: listing.id,
      title: listing.title,
      requested: item.quantity,
      available,
      ok: available >= item.quantity,
    };
  });

  return {
    ok: results.every((item) => item.ok),
    items: results,
    listings,
  };
};

type StripeSessionRequest = {
  shippingOptions: StripeShippingOption[];
  email: string;
  name: string;
  items: CheckoutItem[];
  countryCode: string;
  adminCreated?: boolean;
};

export const createStripeSession = async (input: StripeSessionRequest) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET!, {
    apiVersion: "2022-11-15",
  });

  const { items, shippingOptions, email, name, countryCode } = input;
  return Sentry.startSpan(
    {
      name: "checkout.createSession",
      op: "function",
      attributes: {
        email,
        itemCount: items.length,
        countryCode,
        adminCreated: Boolean(input.adminCreated),
      },
    },
    async (rootSpan) => {
      try {
        const redirectURL =
          process.env.NODE_ENV === "development"
            ? "http://localhost:3000"
            : `https://partedeuro.com.au`;

        const normalizedItems = normalizeCheckoutItems(items);

        const stockValidation = await Sentry.startSpan(
          {
            name: "checkout.validateStock",
            op: "function",
            attributes: { itemCount: normalizedItems.length },
          },
          async (span) => {
            const validation = await validateCheckoutStock(normalizedItems);
            span.setAttribute("listingCount", validation.listings.length);

            if (!validation.ok) {
              const unavailable = validation.items.find((item) => !item.ok);
              throw new Error(
                unavailable
                  ? `${unavailable.title} is out of stock for requested quantity.`
                  : "One or more cart items are out of stock.",
              );
            }

            return validation;
          },
        );
        const listingsPurchased = stockValidation.listings;

        const customer = await Sentry.startSpan(
          {
            name: "checkout.stripe.createCustomer",
            op: "http.client",
            attributes: { email },
          },
          async () =>
            stripe.customers.create({
              email,
              name,
            }),
        );

        const stripeLineItems = listingsPurchased.map((item) => {
          const itemProvided = normalizedItems.find(
            (itemQuery) => itemQuery.itemId === item.id,
          );
          return {
            price_data: {
              currency: "aud",
              product_data: {
                name: item.title,
                images: item.images[0] ? [item.images[0].url] : [],
                metadata: {
                  inventoryLocations: item.allocatedParts
                    .map((part) => part.inventoryLocation?.name)
                    .join(","),
                },
              },
              unit_amount: item.price * 100,
            },
            quantity: itemProvided?.quantity ?? 1,
          };
        });

        const order = await Sentry.startSpan(
          {
            name: "checkout.createPendingOrder",
            op: "db",
            attributes: { listingCount: listingsPurchased.length },
          },
          async (span) => {
            const newOrder = await db.$transaction(async (tx) => {
              const created = await tx.order.create({
                data: {
                  email,
                  name,
                  status: input.adminCreated ? "Pending payment" : "PENDING",
                  subtotal: stripeLineItems.reduce(
                    (acc, cur) =>
                      acc + cur.price_data.unit_amount * cur.quantity,
                    0,
                  ),
                },
              });

              for (const listing of listingsPurchased) {
                const itemProvided = normalizedItems.find(
                  (itemQuery) => itemQuery.itemId === listing.id,
                );
                if (!itemProvided) continue;

                await tx.orderItem.create({
                  data: {
                    orderId: created.id,
                    listingId: listing.id,
                    quantity: itemProvided.quantity,
                    unitPrice: listing.price,
                  },
                });
              }

              return created;
            });

            span.setAttribute("orderId", newOrder.id);
            return newOrder;
          },
        );

        rootSpan.setAttribute("orderId", order.id);

        const session = await Sentry.startSpan(
          {
            name: "checkout.stripe.createSession",
            op: "http.client",
            attributes: {
              orderId: order.id,
              lineItemCount: stripeLineItems.length,
            },
          },
          async (span) => {
            const created = await stripe.checkout.sessions.create({
              customer: customer.id,
              payment_method_types: ["card", "afterpay_clearpay", "link"],
              phone_number_collection: {
                enabled: true,
              },
              shipping_address_collection: {
                allowed_countries: [
                  countryCode,
                ] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
              },
              shipping_options:
                shippingOptions as Stripe.Checkout.SessionCreateParams.ShippingOption[],
              line_items:
                stripeLineItems as Stripe.Checkout.SessionCreateParams.LineItem[],
              mode: "payment",
              success_url: `${redirectURL}/checkout/confirmation/${order.id}`,
              cancel_url: `${redirectURL}/checkout?stripeError=true`,
              metadata: {
                orderId: order.id,
              },
            });
            span.setAttribute("stripeSessionId", created.id);
            return created;
          },
        );

        return {
          url: session.url,
        };
      } catch (err) {
        if (err instanceof Error) {
          console.log(err.message);
          throw new Error(err.message);
        }
        throw new Error("Unknown error");
      }
    },
  );
};

export const checkoutRouter = createTRPCRouter({
  validateCartStock: publicProcedure
    .input(
      z.object({
        items: z.array(checkoutItemSchema),
      }),
    )
    .query(async ({ input }) => {
      const validation = await validateCheckoutStock(input.items);
      return {
        ok: validation.ok,
        items: validation.items,
      };
    }),
  getStripeCheckout: publicProcedure
    .input(
      z.object({
        items: z.array(checkoutItemSchema),
        name: z.string(),
        email: z.string(),
        countryCode: z.string(),
        shippingOptions: z.array(
          z.object({
            shipping_rate_data: z.object({
              type: z.string(),
              display_name: z.string(),
              fixed_amount: z.object({
                amount: z.number(),
                currency: z.string(),
              }),
            }),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { items, name, email, countryCode, shippingOptions } = input;

      const session = await createStripeSession({
        items,
        name,
        email,
        countryCode,
        shippingOptions,
      });

      return {
        url: session.url,
      };
    }),
  getDirectStripeCheckout: adminProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            partId: z.string(),
            description: z.string(),
            price: z.number(),
          }),
        ),
        name: z.string(),
        email: z.string(),
        shippingMethod: z.string(),
        postageCost: z.number(),
        countryCode: z.string(),
      }),
    )
    .mutation(async ({ input }) =>
      Sentry.startSpan(
        {
          name: "checkout.createDirectSession",
          op: "function",
          attributes: {
            email: input.email,
            itemCount: input.items.length,
            countryCode: input.countryCode,
          },
        },
        async (rootSpan) => {
          const stripe = new Stripe(process.env.STRIPE_SECRET!, {
            apiVersion: "2022-11-15",
          });

          const partIds = input.items.map((i) => i.partId);
          const parts = await Sentry.startSpan(
            {
              name: "checkout.direct.validateParts",
              op: "db",
              attributes: { partCount: partIds.length },
            },
            async () => {
              const found = await db.part.findMany({
                where: { id: { in: partIds } },
                select: {
                  id: true,
                  status: true,
                  allocatedToListingId: true,
                },
              });

              if (found.length !== partIds.length) {
                throw new Error("One or more parts not found.");
              }

              const unavailable = found.filter(
                (p) => !SELLABLE_PART_STATUSES.includes(p.status),
              );
              if (unavailable.length > 0) {
                throw new Error("One or more parts are not available.");
              }

              return found;
            },
          );

          const partById = new Map(parts.map((p) => [p.id, p]));
          const subtotal = input.items.reduce((acc, i) => acc + i.price, 0);

          const redirectURL =
            process.env.NODE_ENV === "development"
              ? "http://localhost:3000"
              : "https://partedeuro.com.au";

          const order = await Sentry.startSpan(
            {
              name: "checkout.direct.createPendingOrder",
              op: "db",
              attributes: { partCount: partIds.length },
            },
            async (span) => {
              const created = await db.$transaction(async (tx) => {
                const newOrder = await tx.order.create({
                  data: {
                    name: input.name,
                    email: input.email,
                    status: "Pending payment",
                    subtotal: Math.round(subtotal * 100),
                    shipping: Math.round(input.postageCost * 100),
                    shippingMethod: input.shippingMethod,
                  },
                });

                for (const item of input.items) {
                  const part = partById.get(item.partId);
                  const orderItem = await tx.orderItem.create({
                    data: {
                      orderId: newOrder.id,
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

                return newOrder;
              });
              span.setAttribute("orderId", created.id);
              return created;
            },
          );

          rootSpan.setAttribute("orderId", order.id);
          rootSpan.setAttribute("partCount", partIds.length);

          const customer = await Sentry.startSpan(
            {
              name: "checkout.direct.stripe.createCustomer",
              op: "http.client",
              attributes: { email: input.email },
            },
            async () =>
              stripe.customers.create({
                email: input.email,
                name: input.name,
              }),
          );

          const stripeLineItems: Stripe.Checkout.SessionCreateParams.LineItem[] =
            input.items.map((item) => ({
              price_data: {
                currency: "aud",
                product_data: { name: item.description },
                unit_amount: Math.round(item.price * 100),
              },
              quantity: 1,
            }));

          const shippingOptions: Stripe.Checkout.SessionCreateParams.ShippingOption[] =
            input.postageCost > 0
              ? [
                  {
                    shipping_rate_data: {
                      type: "fixed_amount",
                      display_name: input.shippingMethod,
                      fixed_amount: {
                        amount: Math.round(input.postageCost * 100),
                        currency: "aud",
                      },
                    },
                  },
                ]
              : [];

          const session = await Sentry.startSpan(
            {
              name: "checkout.direct.stripe.createSession",
              op: "http.client",
              attributes: {
                orderId: order.id,
                lineItemCount: stripeLineItems.length,
              },
            },
            async (span) => {
              const created = await stripe.checkout.sessions.create({
                customer: customer.id,
                payment_method_types: ["card", "afterpay_clearpay", "link"],
                phone_number_collection: { enabled: true },
                shipping_address_collection: {
                  allowed_countries: [
                    input.countryCode,
                  ] as Stripe.Checkout.SessionCreateParams.ShippingAddressCollection.AllowedCountry[],
                },
                shipping_options: shippingOptions,
                line_items: stripeLineItems,
                mode: "payment",
                success_url: `${redirectURL}/checkout/confirmation/${order.id}`,
                cancel_url: `${redirectURL}/checkout?stripeError=true`,
                metadata: { orderId: order.id },
              });
              span.setAttribute("stripeSessionId", created.id);
              return created;
            },
          );

          return { url: session.url };
        },
      ),
    ),

  getShippingCountries: publicProcedure.query(async () => {
    const res = await fetch(`${auspostBaseUrl}/postage/country.json`, {
      headers: {
        "AUTH-KEY": process.env.AUSPOST_API_KEY!,
      },
    });
    const data = (await res.json()) as ShippingCountryResponse;
    const priorityCountries = ["US", "GB", "CA", "BR"];
    const sortedCountries = data.countries.country.sort((a, b) => {
      const indexA = priorityCountries.indexOf(a.code);
      const indexB = priorityCountries.indexOf(b.code);

      if (indexA !== -1 && indexB !== -1) {
        // Both countries are in the priority list
        return indexA - indexB;
      } else if (indexA !== -1) {
        // Only country A is in the priority list
        return -1;
      } else if (indexB !== -1) {
        // Only country B is in the priority list
        return 1;
      } else {
        // Neither country is in the priority list, sort alphabetically
        return a.name.localeCompare(b.name);
      }
    });
    return sortedCountries;
  }),
  getShippingServices: publicProcedure
    .input(getShippingServicesInputSchema)
    .query(
      async ({
        input,
        ctx,
      }): Promise<{
        services: StripeShippingOption[];
        hasB2BOnlyServices: boolean;
      }> => {
        const { weight, destinationCountry, length, width, height } = input;
        const isAdmin = ctx.session?.user?.isAdmin ?? false;
        let totalB2BFiltered = 0;

        if (weight >= 20) {
          let shippingServices: StripeShippingOption[] = [];
          try {
            const result = await getInterparcelShippingServices(input);
            shippingServices = result.services;
            totalB2BFiltered += result.b2bFilteredCount;
          } catch (error) {
            if (destinationCountry !== "AU") throw error;
            console.error(
              "Failed to fetch Interparcel services for heavy AU shipping:",
              error instanceof Error ? error.message : String(error),
            );
          }
          if (destinationCountry === "AU") {
            shippingServices = [...shippingServices, pickupShippingOption];
          }
          if (isAdmin) {
            shippingServices = [adminShippingOption, ...shippingServices];
          }
          return {
            services: shippingServices,
            hasB2BOnlyServices: !input.b2b && totalB2BFiltered > 0,
          };
        }
        if (destinationCountry !== "AU") {
          let shippingServices: StripeShippingOption[] = [];
          if ([width, length, height].every((dimension) => dimension < 105)) {
            shippingServices =
              await getAusPostInternationalShippingServices(input);
          } else {
            const result = await getInterparcelShippingServices(input);
            shippingServices = result.services;
            totalB2BFiltered += result.b2bFilteredCount;
          }
          if (isAdmin) {
            shippingServices = [adminShippingOption, ...shippingServices];
          }
          return {
            services: shippingServices,
            hasB2BOnlyServices: !input.b2b && totalB2BFiltered > 0,
          };
        }
        let shippingServices: StripeShippingOption[] = [];
        let interparcelServices: StripeShippingOption[] = [];
        if ([width, length, height].every((dimension) => dimension < 105)) {
          try {
            shippingServices = await getDomesticShippingServices(input);
          } catch (error) {
            console.error(
              "Failed to fetch AusPost domestic services:",
              error instanceof Error ? error.message : String(error),
            );
          }
          try {
            const result = await getInterparcelShippingServices(input);
            interparcelServices = result.services;
            totalB2BFiltered += result.b2bFilteredCount;
          } catch (error) {
            console.error(
              "Failed to fetch Interparcel services for domestic AU shipping:",
              error instanceof Error ? error.message : String(error),
            );
          }
        } else {
          try {
            const result = await getInterparcelShippingServices(input);
            shippingServices = result.services;
            totalB2BFiltered += result.b2bFilteredCount;
          } catch (error) {
            console.error(
              "Failed to fetch Interparcel services for oversized AU shipping:",
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        let allShippingServices = [
          pickupShippingOption,
          ...shippingServices,
          ...interparcelServices,
        ];

        if (isAdmin) {
          allShippingServices = [adminShippingOption, ...allShippingServices];
        }

        return {
          services: allShippingServices.slice(0, 4),
          hasB2BOnlyServices: !input.b2b && totalB2BFiltered > 0,
        };
      },
    ),
});
