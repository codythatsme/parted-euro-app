import { Stripe } from "stripe";
import { z } from "zod";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";
import { PrismaClient } from "@prisma/client";
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

  const requests = shippingServicesAvailableData.services
    .filter((service) => !service.service.includes("Hunter"))
    .filter((service) => {
      if (b2b) return true;
      return !service.service.toLowerCase().includes("b2b");
    })
    .map(async (service) => {
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

  if (!validServices.length) {
    throw new Error("Unable to ship this item to the destination country");
  }
  return validServices.slice(0, 4);
};

export type CheckoutItem = {
  itemId: string;
  quantity: number;
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
  const prisma = new PrismaClient();

  const stripe = new Stripe(process.env.STRIPE_SECRET!, {
    apiVersion: "2022-11-15",
  });

  const { items, shippingOptions, email, name, countryCode } = input;
  try {
    const redirectURL =
      process.env.NODE_ENV === "development"
        ? "http://localhost:3000"
        : `https://partedeuro.com.au`;

    // get items from query

    const listingsPurchased = await prisma.listing.findMany({
      where: {
        id: {
          in: items.map((item) => item.itemId),
        },
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
        parts: {
          select: {
            donor: {
              select: {
                vin: true,
              },
            },
            inventoryLocation: {
              select: {
                name: true,
              },
            },
            partDetails: {
              select: {
                partNo: true,
                alternatePartNumbers: true,
                name: true,
                weight: true,
                length: true,
                width: true,
                height: true,
              },
            },
          },
        },
      },
    });

    // create a new customer

    const customer = await stripe.customers.create({
      email,
      name,
    });

    const stripeLineItems = listingsPurchased.map((item) => {
      const itemProvided = items.find(
        (itemQuery) => itemQuery.itemId === item.id,
      );
      return {
        price_data: {
          currency: "aud",
          product_data: {
            name: item.title,
            images: [item.images[0]!.url],
            metadata: {
              VIN: item.parts[0]?.donor!.vin,
              inventoryLocations: item.parts
                .map((part) => part.inventoryLocation?.name)
                .join(","),
            },
          },
          unit_amount: item.price * 100,
        },
        quantity: itemProvided!.quantity,
      };
    });

    const order = await prisma?.order.create({
      data: {
        email,
        name,
        status: input.adminCreated ? "Pending payment" : "PENDING",
        subtotal: stripeLineItems.reduce(
          (acc, cur) => acc + cur.price_data.unit_amount * cur.quantity,
          0,
        ),
      },
    });

    for (const item of listingsPurchased) {
      const itemProvided = items.find(
        (itemQuery) => itemQuery.itemId === item.id,
      );
      const orderItem = await prisma?.orderItem.create({
        data: {
          listingId: item.id,
          quantity: itemProvided!.quantity,
          orderId: order?.id,
        },
      });
      await prisma?.order.update({
        where: {
          id: order?.id,
        },
        data: {
          orderItems: {
            connect: {
              id: orderItem?.id,
            },
          },
        },
      });
    }

    const session = await stripe.checkout.sessions.create({
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
      success_url: `${redirectURL}/checkout/confirmation/${order?.id}`,
      cancel_url: `${redirectURL}/checkout?stripeError=true`,
      metadata: {
        orderId: order?.id ?? "",
      },
    });

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
};

export const checkoutRouter = createTRPCRouter({
  getStripeCheckout: publicProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            itemId: z.string(),
            quantity: z.number(),
          }),
        ),
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
  //   getAdminCheckoutSession: adminProcedure
  //     .input(
  //       z.object({
  //         items: z.array(
  //           z.object({
  //             itemId: z.string(),
  //             quantity: z.number(),
  //             price: z.number(),
  //           }),
  //         ),
  //         name: z.string(),
  //         email: z.string(),
  //         countryCode: z.string(),
  //         shippingOptions: z.array(
  //           z.object({
  //             shipping_rate_data: z.object({
  //               type: z.string(),
  //               display_name: z.string(),
  //               fixed_amount: z.object({
  //                 amount: z.number(),
  //                 currency: z.string(),
  //               }),
  //             }),
  //           }),
  //         ),
  //       }),
  //     )
  //     .query(async ({ ctx, input }) => {
  //       const url = await createStripeSession({ ...input, adminCreated: true });
  //       return url;
  //     }),
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
    .query(async ({ input, ctx }): Promise<StripeShippingOption[]> => {
      const { weight, destinationCountry, length, width, height } = input;
      const isAdmin = ctx.session?.user?.isAdmin ?? false;

      if (weight >= 20) {
        let shippingServices: StripeShippingOption[] = [];
        try {
          shippingServices = await getInterparcelShippingServices(input);
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
        return shippingServices;
      }
      if (destinationCountry !== "AU") {
        let shippingServices;
        if ([width, length, height].every((dimension) => dimension < 105)) {
          shippingServices =
            await getAusPostInternationalShippingServices(input);
        } else {
          shippingServices = await getInterparcelShippingServices(input);
        }
        if (isAdmin) {
          shippingServices = [adminShippingOption, ...shippingServices];
        }
        return shippingServices;
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
        // Try to get Interparcel services, but don't fail if it errors
        try {
          interparcelServices = await getInterparcelShippingServices(input);
        } catch (error) {
          console.error(
            "Failed to fetch Interparcel services for domestic AU shipping:",
            error instanceof Error ? error.message : String(error),
          );
          // Continue without Interparcel services
        }
      } else {
        try {
          shippingServices = await getInterparcelShippingServices(input);
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

      return allShippingServices.slice(0, 4);
    }),
});
