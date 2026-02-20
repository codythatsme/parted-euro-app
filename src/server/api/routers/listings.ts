import { z } from "zod";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { type Prisma } from "@prisma/client";

const prepareSearchTerms = (search: string | undefined): string[] => {
  if (!search) return [];
  return search
    .toLowerCase()
    .split(/\s+/)
    .filter((term) => term.length > 0);
};

export const listingsRouter = createTRPCRouter({
  getAllAdmin: adminProcedure.query(async ({ ctx }) => {
    const items = await ctx.db.listing.findMany({
      orderBy: {
        createdAt: "desc",
      },
      include: {
        parts: {
          select: {
            id: true,
            variant: true,
            quantity: true,
            partDetails: {
              select: {
                partNo: true,
                name: true,
                cars: {
                  select: {
                    id: true,
                    generation: true,
                    series: true,
                    model: true,
                    body: true,
                  },
                },
              },
            },
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
      items,
    };
  }),

  create: adminProcedure
    .input(
      z.object({
        title: z.string().min(1),
        description: z.string().min(1),
        condition: z.string().min(1),
        price: z.number().positive(),
        parts: z.array(z.string()).min(1),
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
      const listing = await ctx.db.listing.create({
        data: {
          title: input.title,
          description: input.description,
          condition: input.condition,
          price: input.price,
          active: true,
          parts: {
            connect: input.parts.map((partId) => ({ id: partId })),
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
      });

      return listing;
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
          parts: z.array(z.string()).min(1),
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
      // First, fetch current parts to compare with new parts
      const currentListing = await ctx.db.listing.findUnique({
        where: { id: input.id },
        include: {
          parts: true,
          images: true,
        },
      });

      if (!currentListing) {
        throw new Error("Listing not found");
      }

      // Get parts to disconnect and connect
      const currentPartIds = currentListing.parts.map((part) => part.id);
      const partsToDisconnect = currentPartIds.filter(
        (id) => !input.data.parts.includes(id),
      );
      const partsToConnect = input.data.parts.filter(
        (id) => !currentPartIds.includes(id),
      );

      // Update the listing with transactions to handle parts and images
      const updatedListing = await ctx.db.$transaction(async (tx) => {
        // Disconnect parts that are not in the new list
        if (partsToDisconnect.length > 0) {
          await tx.listing.update({
            where: { id: input.id },
            data: {
              parts: {
                disconnect: partsToDisconnect.map((id) => ({ id })),
              },
            },
          });
        }

        // Connect new parts
        if (partsToConnect.length > 0) {
          await tx.listing.update({
            where: { id: input.id },
            data: {
              parts: {
                connect: partsToConnect.map((id) => ({ id })),
              },
            },
          });
        }

        // Delete all current images
        await tx.image.deleteMany({
          where: { listingId: input.id },
        });

        // Create new images if provided
        if (input.data.images && input.data.images.length > 0) {
          await tx.image.createMany({
            data: input.data.images.map((image) => ({
              url: image.url,
              order: image.order,
              listingId: input.id,
            })),
          });
        }

        // Update the main listing data
        return tx.listing.update({
          where: { id: input.id },
          data: {
            title: input.data.title,
            description: input.data.description,
            condition: input.data.condition,
            price: input.data.price,
          },
        });
      });

      return updatedListing;
    }),

  delete: adminProcedure
    .input(
      z.object({
        id: z.string(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // First, delete all images associated with the listing
      await ctx.db.image.deleteMany({
        where: { listingId: input.id },
      });

      // Then delete the listing
      const listing = await ctx.db.listing.delete({
        where: { id: input.id },
      });

      return listing;
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
      const listing = await ctx.db.listing.findUnique({
        where: {
          id: input.id,
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
          parts: {
            select: {
              donor: {
                select: {
                  vin: true,
                  year: true,
                  car: true,
                  mileage: true,
                },
              },
              partDetails: {
                select: {
                  length: true,
                  name: true,
                  width: true,
                  height: true,
                  weight: true,
                  partNo: true,
                  alternatePartNumbers: true,
                  cars: {
                    select: {
                      id: true,
                      generation: true,
                      series: true,
                      model: true,
                      body: true,
                    },
                  },
                },
              },
              quantity: true,
            },
          },
        },
      });
      return listing;
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
          },
        },
        where: {
          id: {
            not: input.id,
          },
          active: true,
          parts: {
            some: {
              partDetails: {
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
      if (listings.length) return listings;
      // just get 4 random listings

      const randomListings = await ctx.db.listing.findMany({
        take: 4,
        include: {
          images: true,
        },
        where: {
          id: {
            not: input.id,
          },
          active: true,
        },
      });
      return randomListings;
    }),
  getListingsByIds: publicProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.ids.length === 0) {
        return []; // Return empty array if no IDs are provided
      }

      const listings = await ctx.db.listing.findMany({
        where: {
          id: {
            in: input.ids,
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
            take: 1, // Only take the first image
            select: {
              url: true,
            },
          },
          // Potentially add stock/quantity check here later if needed
        },
      });
      return listings;
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
      return await ctx.db.$transaction(async (tx) => {
        for (const item of input.items) {
          const listing = await tx.listing.findUnique({
            where: { id: item.listingId },
            include: {
              parts: {
                orderBy: { createdAt: "asc" },
              },
            },
          });

          if (!listing) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Listing not found",
            });
          }

          const totalAvailable = listing.parts.reduce(
            (sum, part) => sum + part.quantity,
            0,
          );
          if (totalAvailable < item.quantity) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Insufficient quantity for listing ${item.listingId}`,
            });
          }

          let remaining = item.quantity;
          for (const part of listing.parts) {
            if (remaining <= 0) break;
            const reduceBy = Math.min(part.quantity, remaining);
            if (reduceBy > 0) {
              await tx.listing.update({
                where: { id: item.listingId },
                data: {
                  parts: {
                    update: {
                      where: { id: part.id },
                      data: { quantity: part.quantity - reduceBy },
                    },
                  },
                },
              });
              remaining -= reduceBy;
            }
          }
        }

        return { success: true };
      });
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
      console.log(input);
      const searchTerms = prepareSearchTerms(input.search);
      const searchConditions = searchTerms.map((term) => ({
        OR: [
          {
            title: {
              contains: term,
              mode: "insensitive",
            },
          },
          {
            parts: {
              some: {
                partDetails: {
                  partNo: {
                    contains: term,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
          {
            parts: {
              some: {
                partDetails: {
                  alternatePartNumbers: {
                    contains: term,
                    mode: "insensitive",
                  },
                },
              },
            },
          },
        ],
      }));
      const orderBy: Record<string, "asc" | "desc"> = {};
      orderBy[input.sortBy] = input.sortOrder as "asc" | "desc";
      if (
        !input.generation &&
        !input.model &&
        !input.series &&
        !input.make &&
        !input.category &&
        !input.subcat
      ) {
        const queryWhere = {
          active: true,
          AND: searchTerms.length > 0 ? searchConditions : undefined,
        } as Prisma.ListingWhereInput;
        const listingsRequest = ctx.db.listing.findMany({
          take: 20,
          skip: input.page * 20,
          include: {
            images: {
              orderBy: {
                order: "asc",
              },
            },
            parts: {
              select: {
                quantity: true,
              },
            },
          },
          where: queryWhere,
          orderBy,
        });
        const countRequest = ctx.db.listing.count({ where: queryWhere });
        const [listings, count] = await Promise.all([
          listingsRequest,
          countRequest,
        ]);
        const hasNextPage = count > input.page * 20 + 20;
        const totalPages = Math.ceil(count / 20);
        return { listings, count, hasNextPage, totalPages };
      } else {
        // Build the filter conditions based on what's provided
        const filterConditions = [];

        // Add search conditions if any
        if (searchConditions.length > 0) {
          filterConditions.push(...searchConditions);
        }

        // Add category/subcategory conditions if provided
        if (input.category || input.subcat) {
          filterConditions.push({
            parts: {
              some: {
                partDetails: {
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

        // Add car-specific conditions if any provided
        if (input.generation || input.model || input.series || input.make) {
          filterConditions.push({
            parts: {
              some: {
                partDetails: {
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
                            make: { contains: input.make, mode: "insensitive" },
                          }
                        : {}),
                    },
                  },
                },
              },
            },
          });
        }

        const queryWhere = {
          active: true,
          AND: filterConditions,
        } as Prisma.ListingWhereInput;

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
            parts: {
              select: {
                quantity: true,
              },
            },
          },
          where: queryWhere,
          orderBy,
        });
        const countRequest = ctx.db.listing.count({ where: queryWhere });
        const [listings, count] = await Promise.all([
          listingsRequest,
          countRequest,
        ]);
        const hasNextPage = count > input.page * 20 + 20;
        const totalPages = Math.ceil(count / 20);
        return { listings, count, hasNextPage, totalPages };
      }
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
            parts: {
              some: {
                partDetails: {
                  partNo: { contains: term, mode: "insensitive" as const },
                },
              },
            },
          },
          {
            parts: {
              some: {
                partDetails: {
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
    const listings = await ctx.db.listing.findMany({
      where: {
        active: true,
      },
    });
    return listings;
  }),
});
