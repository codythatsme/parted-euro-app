import { PartStatus, type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import {
  calculateComponentAvailability,
  calculateRequiredPartCounts,
  calculateStock,
} from "~/server/lib/stock";
import { syncEbayQuantitiesForListings, syncEbayQuantityForListing } from "~/server/lib/ebay-sync";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";

const componentSchema = z.object({
  partDetailId: z.string().trim().min(1),
  quantity: z.number().int().min(1),
});

type StockListingInput = {
  components: Array<{
    partDetailId: string;
    quantity: number;
  }>;
  allocatedParts: Array<{
    partDetailsId: string;
    status: PartStatus;
  }>;
};

const prepareSearchTerms = (search: string | undefined): string[] => {
  if (!search) return [];
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
};

const withStock = <T extends StockListingInput>(listing: T) => ({
  ...listing,
  stock: calculateStock({
    components: listing.components.map((component) => ({
      partDetailId: component.partDetailId,
      quantity: component.quantity,
    })),
    inventoryParts: listing.allocatedParts.map((part) => ({
      partDetailsId: part.partDetailsId,
      status: part.status,
    })),
  }),
  componentAvailability: calculateComponentAvailability({
    components: listing.components.map((component) => ({
      partDetailId: component.partDetailId,
      quantity: component.quantity,
    })),
    inventoryParts: listing.allocatedParts.map((part) => ({
      partDetailsId: part.partDetailsId,
      status: part.status,
    })),
  }),
});

const allocateUnallocatedInventory = async (input: {
  tx: Prisma.TransactionClient;
  listingId: string;
  componentPartDetailIds: string[];
}) => {
  if (input.componentPartDetailIds.length === 0) {
    return;
  }

  await input.tx.part.updateMany({
    where: {
      status: PartStatus.AVAILABLE,
      allocatedToListingId: null,
      partDetailsId: {
        in: input.componentPartDetailIds,
      },
    },
    data: {
      allocatedToListingId: input.listingId,
    },
  });
};

export const listingsRouter = createTRPCRouter({
  getAllAdmin: adminProcedure.query(async ({ ctx }) => {
    const items = await ctx.db.listing.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        components: {
          include: {
            partDetail: {
              include: {
                cars: true,
              },
            },
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        allocatedParts: {
          include: {
            partDetails: {
              include: {
                cars: true,
              },
            },
            donor: true,
            inventoryLocation: true,
          },
          orderBy: {
            createdAt: "asc",
          },
        },
        images: {
          orderBy: {
            order: "asc",
          },
          select: {
            id: true,
            url: true,
            order: true,
          },
        },
      },
    });

    return {
      items: items.map((item) => withStock(item)),
    };
  }),

  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        condition: z.string().min(1),
        price: z.number().positive(),
        components: z.array(componentSchema).min(1),
        images: z
          .array(
            z.object({
              id: z.string(),
              url: z.string(),
              order: z.number(),
            }),
          )
          .optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.$transaction(async (tx) => {
        const created = await tx.listing.create({
          data: {
            title: input.title,
            description: input.description,
            condition: input.condition,
            price: input.price,
            active: true,
            components: {
              createMany: {
                data: input.components,
              },
            },
            images: input.images
              ? {
                  createMany: {
                    data: input.images.map((image) => ({
                      url: image.url,
                      order: image.order,
                    })),
                  },
                }
              : undefined,
          },
          include: {
            components: true,
            allocatedParts: true,
            images: {
              orderBy: {
                order: "asc",
              },
            },
          },
        });

        await allocateUnallocatedInventory({
          tx,
          listingId: created.id,
          componentPartDetailIds: [
            ...new Set(input.components.map((component) => component.partDetailId)),
          ],
        });

        return created;
      });

      await syncEbayQuantityForListing(listing.id).catch((error) => {
        console.error("eBay quantity sync failed after listing create", error);
      });

      return withStock(listing);
    }),

  update: adminProcedure
    .input(
      z.object({
        id: z.string(),
        data: z.object({
          title: z.string().min(1),
          description: z.string().min(1),
          condition: z.string().min(1),
          price: z.number().positive(),
          components: z.array(componentSchema).min(1),
          images: z
            .array(
              z.object({
                id: z.string(),
                url: z.string(),
                order: z.number(),
              }),
            )
            .optional(),
        }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const updatedListing = await ctx.db.$transaction(async (tx) => {
        const current = await tx.listing.findUnique({
          where: {
            id: input.id,
          },
          include: {
            components: true,
          },
        });
        if (!current) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Listing not found",
          });
        }

        const nextComponentIds = new Set(
          input.data.components.map((component) => component.partDetailId),
        );
        const previousComponentIds = new Set(
          current.components.map((component) => component.partDetailId),
        );
        const removedComponentIds = [...previousComponentIds].filter(
          (partDetailId) => !nextComponentIds.has(partDetailId),
        );

        await tx.listingComponent.deleteMany({
          where: {
            listingId: input.id,
            partDetailId: {
              in: removedComponentIds,
            },
          },
        });

        for (const component of input.data.components) {
          await tx.listingComponent.upsert({
            where: {
              listingId_partDetailId: {
                listingId: input.id,
                partDetailId: component.partDetailId,
              },
            },
            update: {
              quantity: component.quantity,
            },
            create: {
              listingId: input.id,
              partDetailId: component.partDetailId,
              quantity: component.quantity,
            },
          });
        }

        if (removedComponentIds.length > 0) {
          await tx.part.updateMany({
            where: {
              allocatedToListingId: input.id,
              status: PartStatus.AVAILABLE,
              partDetailsId: {
                in: removedComponentIds,
              },
            },
            data: {
              allocatedToListingId: null,
            },
          });
        }

        await allocateUnallocatedInventory({
          tx,
          listingId: input.id,
          componentPartDetailIds: [...nextComponentIds],
        });

        await tx.image.deleteMany({
          where: {
            listingId: input.id,
          },
        });

        if (input.data.images && input.data.images.length > 0) {
          await tx.image.createMany({
            data: input.data.images.map((image) => ({
              url: image.url,
              order: image.order,
              listingId: input.id,
            })),
          });
        }

        return tx.listing.update({
          where: {
            id: input.id,
          },
          data: {
            title: input.data.title,
            description: input.data.description,
            condition: input.data.condition,
            price: input.data.price,
          },
          include: {
            components: true,
            allocatedParts: true,
            images: {
              orderBy: {
                order: "asc",
              },
            },
          },
        });
      });

      await syncEbayQuantityForListing(updatedListing.id).catch((error) => {
        console.error("eBay quantity sync failed after listing update", error);
      });

      return withStock(updatedListing);
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const orderItemCount = await ctx.db.orderItem.count({
        where: {
          listingId: input.id,
        },
      });

      if (orderItemCount > 0) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot delete listing with order history. Retire it instead.",
        });
      }

      const listing = await ctx.db.listing.update({
        where: {
          id: input.id,
        },
        data: {
          active: false,
        },
      });
      return listing;
    }),

  getStock: publicProcedure
    .input(
      z.object({
        listingId: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findUnique({
        where: {
          id: input.listingId,
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

      return {
        stock: calculateStock({
          components: listing.components,
          inventoryParts: listing.allocatedParts,
        }),
      };
    }),

  allocateInventory: adminProcedure
    .input(
      z.object({
        listingId: z.string(),
        assignPartIds: z.array(z.string()).default([]),
        unassignPartIds: z.array(z.string()).default([]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findUnique({
        where: {
          id: input.listingId,
        },
        select: {
          id: true,
        },
      });
      if (!listing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Listing not found",
        });
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const assignResult =
          input.assignPartIds.length > 0
            ? await tx.part.updateMany({
                where: {
                  id: {
                    in: input.assignPartIds,
                  },
                  status: PartStatus.AVAILABLE,
                },
                data: {
                  allocatedToListingId: input.listingId,
                },
              })
            : { count: 0 };

        const unassignResult =
          input.unassignPartIds.length > 0
            ? await tx.part.updateMany({
                where: {
                  id: {
                    in: input.unassignPartIds,
                  },
                  allocatedToListingId: input.listingId,
                  status: PartStatus.AVAILABLE,
                },
                data: {
                  allocatedToListingId: null,
                },
              })
            : { count: 0 };

        return {
          assigned: assignResult.count,
          unassigned: unassignResult.count,
        };
      });

      await syncEbayQuantityForListing(input.listingId).catch((error) => {
        console.error("eBay quantity sync failed after manual allocation", error);
      });

      return {
        success: true,
        ...result,
      };
    }),

  getListingMetadata: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findUnique({
        where: {
          id: input.id,
        },
        select: {
          title: true,
          description: true,
          images: {
            orderBy: {
              order: "asc",
            },
          },
        },
      });
      return listing;
    }),

  getListing: publicProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const listing = await ctx.db.listing.findFirst({
        where: {
          id: input.id,
          active: true,
        },
        select: {
          id: true,
          title: true,
          description: true,
          condition: true,
          price: true,
          images: {
            orderBy: {
              order: "asc",
            },
          },
          components: {
            include: {
              partDetail: {
                include: {
                  cars: true,
                },
              },
            },
          },
          allocatedParts: {
            select: {
              id: true,
              status: true,
              partDetailsId: true,
              donor: {
                select: {
                  vin: true,
                  year: true,
                  mileage: true,
                  car: true,
                },
              },
              inventoryLocation: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });
      if (!listing) return null;
      return withStock(listing);
    }),

  getRelatedListings: publicProcedure
    .input(
      z.object({
        generation: z.string(),
        model: z.string(),
        id: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const listings = await ctx.db.listing.findMany({
        take: 4,
        include: {
          images: {
            orderBy: {
              order: "asc",
            },
            take: 1,
          },
        },
        where: {
          id: {
            not: input.id,
          },
          active: true,
          components: {
            some: {
              partDetail: {
                cars: {
                  some: {
                    generation: input.generation,
                    model: input.model,
                  },
                },
              },
            },
          },
        },
      });
      if (listings.length > 0) return listings;

      return ctx.db.listing.findMany({
        take: 4,
        include: {
          images: {
            orderBy: {
              order: "asc",
            },
            take: 1,
          },
        },
        where: {
          id: {
            not: input.id,
          },
          active: true,
        },
      });
    }),

  getListingsByIds: publicProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) {
        return [];
      }

      const listings = await ctx.db.listing.findMany({
        where: {
          id: {
            in: input.ids,
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
            take: 1,
            select: {
              url: true,
            },
          },
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

      return listings.map((listing) => ({
        id: listing.id,
        title: listing.title,
        price: listing.price,
        images: listing.images,
        stock: calculateStock({
          components: listing.components,
          inventoryParts: listing.allocatedParts,
        }),
      }));
    }),

  markPartsSold: adminProcedure
    .input(
      z.object({
        items: z.array(
          z.object({
            listingId: z.string(),
            quantity: z.number().int().positive(),
          }),
        ),
        orderName: z.string().default("eBay order"),
        orderEmail: z.string().default("ebay-order@partedeuro.local"),
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

      const result = await ctx.db.$transaction(async (tx) => {
        const subtotal = input.items.reduce((acc, item) => {
          const listing = listingById.get(item.listingId);
          return acc + (listing?.price ?? 0) * item.quantity;
        }, 0);

        const order = await tx.order.create({
          data: {
            name: input.orderName,
            email: input.orderEmail,
            subtotal: Math.round(subtotal * 100),
            status: "PAID",
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
            const updated = await tx.part.updateMany({
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

            if (updated.count !== soldPartIds.length) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Inventory changed while finalizing order. Please retry.",
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

        return {
          success: true,
          orderId: order.id,
        };
      });

      await syncEbayQuantitiesForListings(listingIds).catch((error) => {
        console.error("eBay quantity sync failed after markPartsSold", error);
      });
      return result;
    }),

  bulkReduceQuantities: adminProcedure
    .input(
      z.object({
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

      const result = await ctx.db.$transaction(async (tx) => {
        const subtotal = input.items.reduce((acc, item) => {
          const listing = listingById.get(item.listingId);
          return acc + (listing?.price ?? 0) * item.quantity;
        }, 0);

        const order = await tx.order.create({
          data: {
            name: "eBay order",
            email: "ebay-order@partedeuro.local",
            subtotal: Math.round(subtotal * 100),
            status: "PAID",
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
            const updated = await tx.part.updateMany({
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

            if (updated.count !== soldPartIds.length) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Inventory changed while finalizing order. Please retry.",
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

        return {
          success: true,
          orderId: order.id,
        };
      });

      await syncEbayQuantitiesForListings(listingIds).catch((error) => {
        console.error("eBay quantity sync failed after bulkReduceQuantities", error);
      });
      return result;
    }),

  searchListings: publicProcedure
    .input(
      z.object({
        generation: z.string().optional(),
        model: z.string().optional(),
        series: z.string().optional(),
        make: z.string().optional(),
        search: z.string().optional(),
        category: z.string().optional(),
        subcat: z.string().optional(),
        page: z.number(),
        sortBy: z.string(),
        sortOrder: z.string(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const searchTerms = prepareSearchTerms(input.search);
      const searchConditions: Prisma.ListingWhereInput[] = searchTerms.map(
        (term) => ({
          OR: [
            {
              title: {
                contains: term,
                mode: "insensitive",
              },
            },
            {
              components: {
                some: {
                  partDetail: {
                    partNo: {
                      contains: term,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
            {
              components: {
                some: {
                  partDetail: {
                    alternatePartNumbers: {
                      contains: term,
                      mode: "insensitive",
                    },
                  },
                },
              },
            },
          ],
        }),
      );

      const filterConditions: Prisma.ListingWhereInput[] = [];
      if (searchConditions.length > 0) {
        filterConditions.push(...searchConditions);
      }

      if (input.category || input.subcat) {
        filterConditions.push({
          components: {
            some: {
              partDetail: {
                partTypes: {
                  some: {
                    parent: input.category
                      ? {
                          name: {
                            contains: input.category,
                            mode: "insensitive",
                          },
                        }
                      : undefined,
                    name: input.subcat
                      ? { contains: input.subcat, mode: "insensitive" }
                      : undefined,
                  },
                },
              },
            },
          },
        });
      }

      if (input.generation || input.model || input.series || input.make) {
        filterConditions.push({
          components: {
            some: {
              partDetail: {
                cars: {
                  some: {
                    ...(input.generation
                      ? {
                          generation: {
                            contains: input.generation,
                            mode: "insensitive",
                          },
                        }
                      : {}),
                    ...(input.model
                      ? {
                          model: {
                            contains: input.model,
                            mode: "insensitive",
                          },
                        }
                      : {}),
                    ...(input.series
                      ? {
                          series: {
                            contains: input.series,
                            mode: "insensitive",
                          },
                        }
                      : {}),
                    ...(input.make
                      ? {
                          make: {
                            contains: input.make,
                            mode: "insensitive",
                          },
                        }
                      : {}),
                  },
                },
              },
            },
          },
        });
      }

      const queryWhere: Prisma.ListingWhereInput = {
        active: true,
        AND: filterConditions.length > 0 ? filterConditions : undefined,
      };
      const safeSortField =
        input.sortBy === "price" || input.sortBy === "createdAt"
          ? input.sortBy
          : "createdAt";
      const orderBy: Record<string, "asc" | "desc"> = {};
      orderBy[safeSortField] = input.sortOrder === "asc" ? "asc" : "desc";

      const listingsRequest = ctx.db.listing.findMany({
        take: 20,
        skip: input.page * 20,
        include: {
          images: {
            take: 2,
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
            select: {
              partDetailsId: true,
              status: true,
            },
          },
        },
        where: queryWhere,
        orderBy,
      });
      const countRequest = ctx.db.listing.count({ where: queryWhere });
      const [listings, count] = await Promise.all([listingsRequest, countRequest]);
      const hasNextPage = count > input.page * 20 + 20;
      const totalPages = Math.ceil(count / 20);

      return {
        listings: listings.map((listing) => ({
          ...listing,
          stock: calculateStock({
            components: listing.components,
            inventoryParts: listing.allocatedParts,
          }),
        })),
        count,
        hasNextPage,
        totalPages,
      };
    }),

  globalSearch: publicProcedure
    .input(
      z.object({
        query: z.string().min(1),
        limit: z.number().default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const searchTerms = prepareSearchTerms(input.query);

      if (searchTerms.length === 0) {
        return [];
      }

      const searchConditions = searchTerms.map((term) => ({
        OR: [
          { title: { contains: term, mode: "insensitive" as const } },
          { description: { contains: term, mode: "insensitive" as const } },
          {
            components: {
              some: {
                partDetail: {
                  partNo: { contains: term, mode: "insensitive" as const },
                },
              },
            },
          },
          {
            components: {
              some: {
                partDetail: {
                  alternatePartNumbers: {
                    contains: term,
                    mode: "insensitive" as const,
                  },
                },
              },
            },
          },
        ],
      }));

      const listings = await ctx.db.listing.findMany({
        where: {
          active: true,
          AND: searchConditions,
        },
        select: {
          id: true,
          title: true,
          price: true,
          description: true,
          images: {
            orderBy: {
              order: "asc",
            },
            take: 1,
            select: {
              url: true,
            },
          },
        },
        take: input.limit,
        orderBy: {
          title: "asc",
        },
      });

      return listings;
    }),

  getSitemapListings: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.listing.findMany({
      where: {
        active: true,
      },
    });
  }),
});
