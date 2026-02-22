import { z } from "zod";
import { PartStatus } from "@prisma/client";
import { adminProcedure, createTRPCRouter } from "../trpc";
import { TRPCError } from "@trpc/server";

// Define inventory input validation schema
const inventorySchema = z.object({
  id: z.string().optional(),
  partDetailsId: z.string().trim().min(1, "Part is required"),
  donorVin: z.string().trim().optional().nullable(),
  inventoryLocationId: z.string().optional().nullable(),
  variant: z.string().optional().nullable(),
  status: z.nativeEnum(PartStatus).optional(),
  allocatedToListingId: z.string().optional().nullable(),
  count: z.coerce.number().int().min(1).optional(),
  images: z
    .array(
      z.object({
        id: z.string(),
        url: z.string(),
        order: z.number(),
        isFromPartImages: z.boolean().optional(),
      }),
    )
    .optional(),
});

export const inventoryRouter = createTRPCRouter({
  // Get all inventory items for select dropdown
  getAllForSelect: adminProcedure.query(async ({ ctx }) => {
    const inventory = await ctx.db.part.findMany({
      where: {
        status: PartStatus.AVAILABLE,
      },
      select: {
        id: true,
        partDetails: {
          select: {
            partNo: true,
            name: true,
          },
        },
        variant: true,
        allocatedToListing: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: {
        partDetails: {
          name: "asc",
        },
      },
    });

    return inventory.map((item) => ({
      value: item.id,
      label: `${item.partDetails.name} - (${item.partDetails.partNo})${
        item.variant ? ` - ${item.variant}` : ""
      }`,
      isAssigned: !!item.allocatedToListing?.id,
      listingTitle: item.allocatedToListing?.title ?? null,
    }));
  }),

  // Get all inventory items
  getAll: adminProcedure.query(async ({ ctx }) => {
    // Execute the query
    const inventory = await ctx.db.part.findMany({
      include: {
        partDetails: {
          select: {
            partNo: true,
            name: true,
            alternatePartNumbers: true,
            cars: {
              select: {
                id: true,
              },
            },
          },
        },
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
        allocatedToListing: {
          select: {
            id: true,
            title: true,
          },
        },
        images: {
          select: {
            id: true,
            url: true,
            order: true,
          },
          orderBy: {
            order: "asc",
          },
        },
      },
    });

    return inventory;
  }),

  // Get an inventory item by ID
  getById: adminProcedure
    .input(z.object({ id: z.string().trim() }))
    .query(async ({ ctx, input }) => {
      const { id } = input;
      const inventory = await ctx.db.part.findUnique({
        where: { id },
        include: {
          partDetails: true,
          donor: true,
          inventoryLocation: true,
          allocatedToListing: true,
          images: {
            select: {
              id: true,
              url: true,
              order: true,
            },
            orderBy: {
              order: "asc",
            },
          },
        },
      });

      if (!inventory) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Inventory item not found",
        });
      }

      return inventory;
    }),

  // Create a new inventory item
  create: adminProcedure
    .input(inventorySchema)
    .mutation(async ({ ctx, input }) => {
      try {
        const { images, ...inventoryData } = input;
        const createCount = Math.max(1, inventoryData.count ?? 1);

        const created = await ctx.db.$transaction(async (tx) => {
          const createdParts = [];
          for (let i = 0; i < createCount; i += 1) {
            const part = await tx.part.create({
              data: {
                partDetailsId: inventoryData.partDetailsId,
                donorVin:
                  inventoryData.donorVin === "none" ? null : inventoryData.donorVin,
                inventoryLocationId:
                  inventoryData.inventoryLocationId === "none"
                    ? null
                    : inventoryData.inventoryLocationId,
                variant: inventoryData.variant ?? null,
                status: inventoryData.status ?? PartStatus.AVAILABLE,
                allocatedToListingId:
                  inventoryData.allocatedToListingId === "none"
                    ? null
                    : inventoryData.allocatedToListingId,
                quantity: 1,
                images: images
                  ? {
                      createMany: {
                        data: images.map((image) => ({
                          id: image.isFromPartImages
                            ? crypto.randomUUID()
                            : crypto.randomUUID(),
                          url: image.url,
                          order: image.order,
                        })),
                      },
                    }
                  : undefined,
              },
              include: {
                partDetails: true,
                donor: true,
                inventoryLocation: true,
                allocatedToListing: true,
                images: true,
              },
            });
            createdParts.push(part);
          }
          return createdParts;
        });

        return created.length === 1 ? created[0] : created;
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to create inventory item",
          cause: error,
        });
      }
    }),

  // Update an inventory item
  update: adminProcedure
    .input(
      z.object({
        id: z.string().trim(),
        data: inventorySchema.omit({ count: true, id: true }),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { id, data } = input;
      const { images, ...updateData } = data;

      try {
        // Transaction to ensure data consistency
        return await ctx.db.$transaction(async (tx) => {
          // If images are provided, replace all part images.
          if (images) {
            await tx.image.deleteMany({ where: { partId: id } });
            if (images.length > 0) {
              await tx.image.createMany({
                data: images.map((img) => ({
                  id: crypto.randomUUID(),
                  url: img.url,
                  order: img.order,
                  partId: id,
                })),
              });
            }
          }

          // Update the part with other data
          const updatedInventory = await tx.part.update({
            where: { id },
            data: {
              partDetailsId: updateData.partDetailsId,
              donorVin:
                updateData.donorVin === "none" ? null : updateData.donorVin,
              inventoryLocationId:
                updateData.inventoryLocationId === "none"
                  ? null
                  : updateData.inventoryLocationId,
              variant: updateData.variant ?? null,
              status: updateData.status,
              allocatedToListingId:
                updateData.allocatedToListingId === "none"
                  ? null
                  : updateData.allocatedToListingId,
              quantity: 1,
            },
            include: {
              partDetails: true,
              donor: true,
              inventoryLocation: true,
              allocatedToListing: true,
              images: {
                orderBy: {
                  order: "asc",
                },
              },
            },
          });

          return updatedInventory;
        });
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to update inventory item",
          cause: error,
        });
      }
    }),

  // Delete an inventory item
  delete: adminProcedure
    .input(z.object({ id: z.string().trim() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;

      try {
        const part = await ctx.db.part.findUnique({
          where: { id },
          select: {
            status: true,
          },
        });
        if (!part) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Inventory item not found",
          });
        }
        if (part.status !== PartStatus.AVAILABLE) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Only AVAILABLE parts can be deleted.",
          });
        }

        // Delete related images first
        await ctx.db.image.deleteMany({
          where: { partId: id },
        });

        await ctx.db.part.delete({
          where: { id },
        });

        return { success: true };
      } catch (error) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete inventory item",
          cause: error,
        });
      }
    }),
});
