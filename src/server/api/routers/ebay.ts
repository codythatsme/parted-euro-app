/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-explicit-any, @typescript-eslint/no-misused-promises, @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unused-vars */
import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";
import type {
  FulfillmentPolicyRequest,
  InventoryLocationFull,
} from "ebay-api/lib/types";
import type {
  Condition,
  CurrencyCode,
  FormatType,
  Marketplace,
  MarketplaceId,
} from "ebay-api/lib/enums";
import { CategoryType, TimeDurationUnit } from "ebay-api/lib/enums";
import { db } from "~/server/db";
import { ebay, initEbayClient } from "~/server/lib/ebay-client";
import { calculateRequiredPartCounts, calculateStock } from "~/server/lib/stock";
import { PartStatus } from "@prisma/client";
import { TRPCError } from "@trpc/server";

type FulfillmentPolicyResponse = {
  fulfillmentPolicies: {
    categoryTypes: {
      default: string;
      name: string;
    }[];
    description: string;
    freightShipping: string;
    fulfillmentPolicyId: string;
    globalShipping: string;
    handlingTime: {
      unit: string;
      value: string;
    };
    localPickup: string;
    marketplaceId: string;
    name: string;
    pickupDropOff: string;
    shippingOptions: {
      costType: string;
      insuranceFee: {
        currency: string;
        value: string;
      };
      insuranceOffered: string;
      optionType: string;
      packageHandlingCost: {
        currency: string;
        value: string;
      };
      rateTableId: string;
      shippingDiscountProfileId: string;
      shippingPromotionOffered: string;
      shippingServices: {
        additionalShippingCost: {
          currency: string;
          value: string;
        };
        buyerResponsibleForPickup: string;
        buyerResponsibleForShipping: string;
        freeShipping: string;
        shippingCarrierCode: string;
        shippingCost: {
          currency: string;
          value: string;
        };
        shippingServiceCode: string;
        shipToLocations: {
          regionExcluded: {
            regionName: string;
            regionType: string;
          }[];
          regionIncluded: {
            regionName: string;
            regionType: string;
          }[];
        };
        sortOrder: string;
        surcharge: {
          currency: string;
          value: string;
        };
      }[];
    }[];
    shipToLocations: {
      regionExcluded: {
        regionName: string;
        regionType: string;
      }[];
      regionIncluded: {
        regionName: string;
        regionType: string;
      }[];
    };
  }[];
  href: string;
  limit: string;
  next: string;
  offset: string;
  prev: string;
  total: string;
};

// Default listing template used for eBay description. Supports placeholders:
// {{DESCRIPTION}} and {{PARTS_TABLE}}
const DEFAULT_EBAY_LISTING_TEMPLATE = `<div style="font-family: Arial; display:flex; flex-direction:column">
  <img style="width:500px" src="https://res.cloudinary.com/dzhmqfmzi/image/upload/v1681223001/Logo_PARTED_EURO_jmszpz.png"/>
  <h3 style="text-decoration: underline;"> Product Description: </h3>
  <p>{{DESCRIPTION}}</p>
  <p>
    Note: Some items sold through Parted Euro are 'generic items', meaning the images used <strong>may</strong> not be images of the exact item that you will receive. Cleanliness and condition of each item <strong> may </strong> vary. Rest assured, the item will definitely be in same quality condition. For specific items such as painted bumpers or items with certain remarks / traits - this will be noted in the description above. If an item is damaged, it will be clearly highlighted and have it's own separate listing to it's undamaged variant. If you are unsure about the exact item you'll be receiving and want to confirm condition of the exact item prior to purchase, please message us directly and we will be happy to send you photos of it.
  </p>
  <h3 style="text-decoration: underline;"> Fitment:</h3>
  {{PARTS_TABLE}}
  <p> Please note: It is the <b> BUYERS REPSONSIBILITY </b> to ensure fitment is correct for their vehicle. If you are unsure, feel free to send us a message and we will do our best to assist. </p>
  <p> <b> Refunds will not be issued </b> if the part is not suitable for your car. </p>
  <h3 style="text-decoration: underline;"> Payment: </h3>
  <p> We only accept PayPal for sales via eBay that are being shipped. For in-store pickup, we can also accept Card (2.5% surcharge) or Cash. Please ensure you have selected the correct delivery method at checkout. </p>
  <h3 style="text-decoration: underline;"> Shipping: </h3>
  <p> Any item(s) purchased will be shipped within <b> 2-3 business days </b> of the sale, once payment has been received. </p>
  <h3 style="text-decoration: underline;"> Warranty / Returns: </h3>
  <p> We offer a 30-Day return policy, if an item fails or is not in the expected condition. </p>
  <p> Unfortunately due to safety concerns, all items that are airbag / brake / hydraulic related are exempt from this warranty, as we cannot ensure the longevity of these second hand parts. Buy at your own risk. </p>
  <p> Refunds will not be issued for change of mind. </p>
  <h3 style="text-decoration: underline;"> About Us: </h3>
  <p> We are a small wrecking business located in Knoxfield, Victoria (Australia). We ship worldwide, or offer in-store pickup. </p>
  <p> If you are chasing something that is not listed on eBay, please feel free to send us a message and we will do our best to assist. </p>
</div>`;

const renderTemplate = (
  template: string,
  variables: Record<string, string>,
) => {
  let output = template;
  for (const [key, value] of Object.entries(variables)) {
    const token = `{{${key}}}`;
    // Use split/join for global replacement without regex pitfalls
    output = output.split(token).join(value);
  }
  return output;
};


const buildPartsTableHtml = (
  cars: { series: string; generation: string; model: string }[],
) => {
  const unique = cars.filter(
    (car, i, self) =>
      i ===
      self.findIndex(
        (x) =>
          x.series === car.series &&
          x.generation === car.generation &&
          x.model === car.model,
      ),
  );
  const rows = unique
    .map(
      (car) =>
        `<tr style="padding:1rem; border-bottom: 1px solid #ddd"><td>${car.series}</td><td>${car.generation}</td><td>${car.model}</td></tr>`,
    )
    .join("");
  return `<table style="padding:1rem; text-align:center; max-width:40rem;"><thead><tr style="border-bottom: 1px solid #ddd"><th style="padding:1rem;">Series</th><th>Generation</th><th>Model</th></tr></thead><tbody>${rows}</tbody></table>`;
};

const getListingStockSnapshot = async (listingId: string) => {
  const listing = await db.listing.findUnique({
    where: {
      id: listingId,
    },
    select: {
      id: true,
      title: true,
      listedOnEbay: true,
      ebayOfferId: true,
      components: {
        select: {
          partDetailId: true,
          quantity: true,
          partDetail: {
            select: {
              partNo: true,
              alternatePartNumbers: true,
            },
          },
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

  const quantity = calculateStock({
    components: listing.components.map((component) => ({
      partDetailId: component.partDetailId,
      quantity: component.quantity,
    })),
    inventoryParts: listing.allocatedParts,
  });

  // Collect all part numbers: each component's partNo + its alternates
  const allMpns = listing.components.flatMap((c) => {
    const numbers = [c.partDetail.partNo];
    if (c.partDetail.alternatePartNumbers) {
      numbers.push(
        ...c.partDetail.alternatePartNumbers
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      );
    }
    return numbers;
  });
  const uniqueMpns = [...new Set(allMpns)];

  return {
    listing,
    quantity,
    primaryPartNo: listing.components[0]?.partDetail.partNo ?? "",
    allMpns: uniqueMpns,
  };
};

export const ebayRouter = createTRPCRouter({
  // Auth functions
  authenticate: adminProcedure.mutation(async ({ ctx }) => {
    ebay.OAuth2.setScope(process.env.EBAY_SCOPES!.split(" "));
    const url = ebay.OAuth2.generateAuthUrl();
    return url;
  }),
  // Template management
  getListingTemplate: adminProcedure.query(async ({ ctx }) => {
    const settings = await ctx.db.ebaySettings.findFirst();
    return settings?.listingTemplate ?? DEFAULT_EBAY_LISTING_TEMPLATE;
  }),
  getDefaultListingTemplate: adminProcedure.query(async () => {
    return DEFAULT_EBAY_LISTING_TEMPLATE;
  }),
  saveListingTemplate: adminProcedure
    .input(
      z.object({
        template: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.ebaySettings.findFirst();
      if (existing) {
        await ctx.db.ebaySettings.update({
          where: { id: existing.id },
          data: { listingTemplate: input.template },
        });
      } else {
        await ctx.db.ebaySettings.create({
          data: { listingTemplate: input.template },
        });
      }
      return { success: true };
    }),
  setTokenSet: adminProcedure
    .input(
      z.object({
        code: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const token = await ebay.OAuth2.getToken(input.code);
      const creds = await ctx.db.ebayCreds.findFirst();
      const updatedCreds = await ctx.db.ebayCreds.update({
        where: {
          id: creds?.id,
        },
        data: {
          refreshToken: token,
        },
      });
      return {
        updatedCreds,
      };
    }),
  testEbayConnection: adminProcedure.query(async ({ ctx }) => {
    await initEbayClient();
    const paymentPolicies =
      await ebay.sell.account.getPaymentPolicies("EBAY_AU");
    return !!paymentPolicies.paymentPolicies[0]?.paymentPolicyId;
  }),

  // Actually using
  getCategoryIds: adminProcedure
    .input(
      z.object({
        title: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      await initEbayClient();
      const res = await ebay.commerce.taxonomy.getCategorySuggestions(
        "15",
        input.title,
      );
      const categoryChoices = res.categorySuggestions.map((category: any) => {
        return {
          label: `${category.category.categoryName} // ${
            category.categoryTreeNodeAncestors.find(
              (x: any) => x.categoryTreeNodeLevel === 1,
            ).categoryName
          }`,
          value: category.category.categoryId,
        };
      });
      return categoryChoices;
    }),
  createListing: adminProcedure
    .input(
      z.object({
        title: z
          .string()
          .max(80, { message: "Title must be less than 80 characters" }),
        description: z.string(),
        price: z.number(),
        partNo: z.string().trim().optional(),
        condition: z.string(),
        conditionDescription: z.string(),
        images: z.array(z.string()),
        quantity: z.number().optional(),
        listingId: z.string(),
        categoryId: z.string(),
        domesticShipping: z.number(),
        internationalShipping: z.number(),
        fulfillmentPolicyId: z.string().optional(),
        partsTable: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      console.log("====================INPUT=====================");
      console.log(input);
      console.log("====================INPUT=====================");
      await initEbayClient();
      const snapshot = await getListingStockSnapshot(input.listingId);
      const quantity = snapshot.quantity;
      const derivedPartNo = snapshot.primaryPartNo || input.partNo || "";
      if (!derivedPartNo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing must have at least one component with a part number.",
        });
      }

      const random = Math.floor(100000 + Math.random() * 900000);
      let fulfillmentPolicy;
      if (!input.fulfillmentPolicyId) {
        console.log("CREATING FULFILLMENT POLICY");
        const createFulfillmentPolicy =
          await ebay.sell.account.createFulfillmentPolicy({
            name: `${input.domesticShipping.toString()}-${input.internationalShipping.toString()}`,
            marketplaceId: "EBAY_AU" as MarketplaceId,
            categoryTypes: [
              { name: "ALL_EXCLUDING_MOTORS_VEHICLES", default: true },
            ],
            handlingTime: {
              unit: "DAY",
              value: 3,
            },
            shippingOptions: [
              {
                costType: "FLAT_RATE",
                optionType: "DOMESTIC",
                shippingServices: [
                  {
                    shippingServiceCode: "AU_StandardDelivery",
                    shippingCost: {
                      currency: "AUD",
                      value: input.domesticShipping.toString(),
                    },
                  },
                ],
              },
              {
                costType: "FLAT_RATE",
                optionType: "DOMESTIC",
                shippingServices: [
                  {
                    shippingServiceCode: "AU_Pickup",
                    shippingCost: {
                      currency: "AUD",
                      value: 0,
                    },
                  },
                ],
              },
              {
                costType: "FLAT_RATE",
                optionType: "INTERNATIONAL",
                shippingServices: [
                  {
                    shipToLocations: {
                      regionIncluded: [{ regionName: "Worldwide" }],
                    },
                    shippingCarrierCode: "AustraliaPost",
                    shippingServiceCode: "AU_StandardInternational",
                    shippingCost: {
                      currency: "AUD",
                      value: input.internationalShipping.toString(),
                    },
                  },
                ],
              },
            ],
          } as FulfillmentPolicyRequest);
        console.log("CREATED FULFILLMENT POLICY");
        console.log("=====================================");
        fulfillmentPolicy = createFulfillmentPolicy.fulfillmentPolicyId;
      } else {
        fulfillmentPolicy = input.fulfillmentPolicyId;
      }
      console.log("CREATING INVENTORY ITEM");
      const createInventoryItem =
        await ebay.sell.inventory.createOrReplaceInventoryItem(
          `${input.listingId} ${random}`,
          {
            availability: {
              shipToLocationAvailability: {
                quantity,
              },
            },
            condition: input.conditionDescription as Condition,
            product: {
              title: input.title,
              description: input.description,
              // @ts-expect-error: TODO: Has updated api broke this?
              aspects: {
                Brand: ["BMW"],
                "Manufacturer Part Number": snapshot.allMpns,
              },
              mpn: derivedPartNo,
              brand: "BMW",
              imageUrls: input.images,
            },
          },
        );
      console.log("CREATED INVENTORY ITEM");
      console.log("=====================================");
      console.log("CREATING OFFER");
      // Build listing description from editable template
      const settings = await ctx.db.ebaySettings.findFirst();
      const template =
        settings?.listingTemplate ?? DEFAULT_EBAY_LISTING_TEMPLATE;
      const listingDescription = renderTemplate(template, {
        DESCRIPTION: input.description,
        PARTS_TABLE: input.partsTable.replaceAll(",", ""),
      });
      const createOffer = await ebay.sell.inventory.createOffer({
        sku: `${input.listingId} ${random}`,
        marketplaceId: "EBAY_AU" as Marketplace,
        format: "FIXED_PRICE" as FormatType,
        availableQuantity: quantity,
        categoryId: input.categoryId, //id of vehicle parts and accs
        listingDescription,
        listingPolicies: {
          fulfillmentPolicyId: fulfillmentPolicy,
          paymentPolicyId: process.env.EBAY_PAYMENT_ID!,
          returnPolicyId: process.env.EBAY_RETURN_ID!,
        },
        merchantLocationKey: process.env.EBAY_MERCHANT_KEY!,
        pricingSummary: {
          price: {
            currency: "AUD" as CurrencyCode,
            value: input.price.toString(),
          },
        },
      });
      console.log("CREATED OFFER");
      console.log("=====================================");
      console.log("PUBLISHING OFFER");
      console.log(`CREATED OFFER ID: ${createOffer.offerId}`);
      const publishOffer = await ebay.sell.inventory.publishOffer(
        createOffer.offerId,
      );
      console.log("PUBLISHED OFFER");
      await ctx.db.listing.update({
        where: {
          id: input.listingId,
        },
        data: {
          listedOnEbay: true,
          ebayOfferId: createOffer.offerId,
        },
      });
      return {
        publishOffer,
        quantity,
      };
    }),
  syncListingQuantity: adminProcedure
    .input(
      z.object({
        listingId: z.string(),
      }),
    )
    .mutation(async ({ input }) => {
      await initEbayClient();
      const snapshot = await getListingStockSnapshot(input.listingId);
      const offerId = snapshot.listing.ebayOfferId;
      if (!snapshot.listing.listedOnEbay || !offerId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Listing is not linked to an eBay offer.",
        });
      }

      const offer = await ebay.sell.inventory.getOffer(offerId);
      offer.availableQuantity = snapshot.quantity;
      await ebay.sell.inventory.updateOffer(offerId, offer);

      return {
        listingId: input.listingId,
        offerId,
        quantity: snapshot.quantity,
      };
    }),
  ingestEbayOrder: adminProcedure
    .input(
      z.object({
        buyerName: z.string().default("eBay Buyer"),
        buyerEmail: z.string().default("ebay-order@partedeuro.local"),
        items: z.array(
          z.object({
            listingId: z.string(),
            quantity: z.number().int().positive(),
          }),
        ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listingIds = input.items.map((item) => item.listingId);
      const listings = await ctx.db.listing.findMany({
        where: {
          id: {
            in: listingIds,
          },
        },
        select: {
          id: true,
          title: true,
          price: true,
          listedOnEbay: true,
          ebayOfferId: true,
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
      const listingById = new Map(listings.map((listing) => [listing.id, listing]));

      for (const item of input.items) {
        const listing = listingById.get(item.listingId);
        if (!listing) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Listing ${item.listingId} not found`,
          });
        }

        const stock = calculateStock({
          components: listing.components,
          inventoryParts: listing.allocatedParts,
        });
        if (stock < item.quantity) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${listing.title} is out of stock for requested quantity.`,
          });
        }
      }

      const created = await ctx.db.$transaction(async (tx) => {
        const subtotal = input.items.reduce((sum, item) => {
          const listing = listingById.get(item.listingId);
          return sum + (listing?.price ?? 0) * item.quantity;
        }, 0);

        const order = await tx.order.create({
          data: {
            name: input.buyerName,
            email: input.buyerEmail,
            status: "PAID",
            subtotal: Math.round(subtotal * 100),
          },
        });

        for (const item of input.items) {
          const listing = listingById.get(item.listingId);
          if (!listing) continue;

          const orderItem = await tx.orderItem.create({
            data: {
              orderId: order.id,
              listingId: listing.id,
              quantity: item.quantity,
              unitPrice: listing.price,
            },
          });

          const requirements = calculateRequiredPartCounts(
            listing.components.map((component) => ({
              partDetailId: component.partDetailId,
              quantity: component.quantity,
            })),
            item.quantity,
          );
          const partIds: string[] = [];

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
            partIds.push(...candidates.map((candidate) => candidate.id));
          }

          if (partIds.length > 0) {
            const updated = await tx.part.updateMany({
              where: {
                id: {
                  in: partIds,
                },
                status: PartStatus.AVAILABLE,
              },
              data: {
                status: PartStatus.SOLD,
                reservedAt: null,
              },
            });
            if (updated.count !== partIds.length) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Inventory changed while ingesting eBay order.",
              });
            }
            await tx.orderItemPart.createMany({
              data: partIds.map((partId) => ({
                orderItemId: orderItem.id,
                partId,
              })),
              skipDuplicates: true,
            });
          }
        }

        return order;
      });

      // Best effort quantity sync for affected listings.
      await Promise.allSettled(
        listings
          .filter((listing) => listing.listedOnEbay && !!listing.ebayOfferId)
          .map(async (listing) => {
            const snapshot = await getListingStockSnapshot(listing.id);
            const offerId = listing.ebayOfferId;
            if (!offerId) return;
            const offer = await ebay.sell.inventory.getOffer(offerId);
            offer.availableQuantity = snapshot.quantity;
            await ebay.sell.inventory.updateOffer(offerId, offer);
          }),
      );

      return {
        success: true,
        orderId: created.id,
      };
    }),
  getFulfillmentPolicies: adminProcedure.query(async ({ ctx }) => {
    await initEbayClient();
    const fulfillmentPolicies = (await ebay.sell.account.getFulfillmentPolicies(
      "EBAY_AU",
    )) as FulfillmentPolicyResponse;
    return fulfillmentPolicies.fulfillmentPolicies.sort(
      (a, b) =>
        Number(a.shippingOptions[0]?.shippingServices[0]?.shippingCost.value) -
        Number(b.shippingOptions[0]?.shippingServices[0]?.shippingCost.value),
    );
  }),
  // Testing
  updateQuantity: adminProcedure
    .input(
      z.object({
        sku: z.string(),
        quantity: z.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await initEbayClient();
      const offers = await ebay.sell.inventory.getOffers({
        sku: input.sku,
      });
      // const inventoryItem = await ebay.sell.inventory.getInventoryItem(
      //   input.sku
      // );
      // return inventoryItem;
      // inventoryItem.availability.shipToLocationAvailability.quantity =
      //   input.quantity;

      // delete inventoryItem.packageWeightAndSize;
      // return inventoryItem;
      // const inventory = await ebay.sell.inventory.createOrReplaceInventoryItem(
      //   input.sku,
      //   inventoryItem
      // );
      // return inventory;
      offers.offers[0].availableQuantity = input.quantity;
      return offers.offers[0];
      const res = await ebay.sell.inventory.updateOffer(
        input.sku,
        offers.offers[0],
      );
      return {
        sku: input.sku,
        quantity: input.quantity,
      };
    }),

  publishOffer: adminProcedure
    .input(
      z.object({
        offerId: z.string(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const offer = await ebay.sell.inventory.getOffer(input.offerId);
      await initEbayClient();
      try {
        const publishOffer = await ebay.sell.inventory.publishOffer(
          input.offerId,
        );
        return publishOffer;
      } catch (e) {
        console.log(e);
      }
    }),

  getInventroyItems: adminProcedure.query(async ({ ctx }) => {
    await initEbayClient();
    const listings = await ebay.sell.inventory.getInventoryItems();
    return listings;
  }),
  getOffer: adminProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ input }) => {
      await initEbayClient();
      const offers = await ebay.sell.inventory.getOffer(input.id);
      return offers;
    }),
  getOffers: adminProcedure
    .input(
      z.object({
        sku: z.string(),
      }),
    )
    .query(async ({ input, ctx }) => {
      await initEbayClient();
      const offers = await ebay.sell.inventory.getOffers({
        sku: input.sku,
      });
      return offers;
    }),
  getPaymentPolicy: adminProcedure.mutation(async ({ ctx }) => {
    await initEbayClient();
    const paymentPolicies =
      await ebay.sell.account.getPaymentPolicies("EBAY_AU");
    return paymentPolicies.paymentPolicies[0].paymentPolicyId;
  }),
  getReturnPolicy: adminProcedure.mutation(async ({ ctx }) => {
    await initEbayClient();
    const returnPolicies = await ebay.sell.account.getReturnPolicies("EBAY_AU");
    return returnPolicies.returnPolicies[0].returnPolicyId;
  }),
  createInventoryLocation: adminProcedure.mutation(async ({ ctx }) => {
    await initEbayClient();
    const inventoryLocation = await ebay.sell.inventory.getInventoryLocations();
    if (inventoryLocation.total > 0) {
      return inventoryLocation.locations[0].merchantLocationKey;
    }
    const res = await ebay.sell.inventory.createInventoryLocation(
      "parted-euro",
      {
        location: {
          address: {
            addressLine1: "26 Rushdale Street",
            addressLine2: "2",
            city: "Knoxfield",
            country: "AU",
            stateOrProvince: "VIC",
            postalCode: "3180",
          },
        },
        name: "Parted Euro",
        locationWebUrl: "https://www.partedeuro.com.au/",
        locationTypes: ["WAREHOUSE"],
        locationInstructions: "Items ship from here",
        merchantLocationStatus: "ENABLED",
      } as InventoryLocationFull,
    );
    const createdLocation = await ebay.sell.inventory.getInventoryLocations();
    return createdLocation.locations[0].merchantLocationKey;
  }),
  regenerateAllDescriptions: adminProcedure.mutation(async ({ ctx }) => {
    await initEbayClient();

    const listings = await ctx.db.listing.findMany({
      where: {
        listedOnEbay: true,
        ebayOfferId: { not: null },
      },
      select: {
        id: true,
        description: true,
        ebayOfferId: true,
        components: {
          select: {
            partDetail: {
              select: {
                cars: {
                  select: { series: true, generation: true, model: true },
                },
              },
            },
          },
        },
      },
    });

    console.log(`Regenerating ${listings.length} listings`);

    const settings = await ctx.db.ebaySettings.findFirst();
    const template =
      settings?.listingTemplate ?? DEFAULT_EBAY_LISTING_TEMPLATE;

    let succeeded = 0;
    let failed = 0;

    const BATCH_SIZE = 25;
    for (let i = 0; i < listings.length; i += BATCH_SIZE) {
      const batch = listings.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(async (listing) => {
          const cars = listing.components.flatMap(
            (c) => c.partDetail.cars,
          );
          const partsTable = buildPartsTableHtml(cars);
          const listingDescription = renderTemplate(template, {
            DESCRIPTION: listing.description,
            PARTS_TABLE: partsTable,
          });

          const offerId = listing.ebayOfferId;
          if (!offerId) return;
          const offer = await ebay.sell.inventory.getOffer(offerId);
          offer.listingDescription = listingDescription;
          await ebay.sell.inventory.updateOffer(offerId, offer);
        }),
      );
      for (const r of results) {
        if (r.status === "fulfilled") succeeded++;
        else failed++;
      }
    }

    return { total: listings.length, succeeded, failed };
  }),
});
