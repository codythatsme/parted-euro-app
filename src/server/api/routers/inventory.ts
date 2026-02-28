import { z } from "zod";
import { PartStatus } from "@prisma/client";
import { adminProcedure, createTRPCRouter } from "../trpc";
import { TRPCError } from "@trpc/server";
import { syncEbayQuantityForListing } from "~/server/lib/ebay-sync";

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

type ListingAssignmentCandidate = {
  id: string;
  title: string;
};

const normalizeOptionalId = (value: string | null | undefined): string | null => {
  if (value === "none") return null;
  return value ?? null;
};

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

  // Lightweight query for listing form allocation picker
  getAvailableForAllocation: adminProcedure
    .input(z.object({ listingId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      return ctx.db.part.findMany({
        where: {
          status: PartStatus.AVAILABLE,
          OR: [
            { allocatedToListingId: null },
            ...(input.listingId
              ? [{ allocatedToListingId: input.listingId }]
              : []),
          ],
        },
        select: {
          id: true,
          variant: true,
          allocatedToListingId: true,
          partDetails: { select: { name: true, partNo: true } },
        },
        orderBy: { partDetails: { name: "asc" } },
      });
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
        const normalizedStatus = inventoryData.status ?? PartStatus.AVAILABLE;
        const explicitListingId = normalizeOptionalId(inventoryData.allocatedToListingId);

        const createResult = await ctx.db.$transaction(async (tx) => {
          let assignmentCandidates: ListingAssignmentCandidate[] = [];
          if (!explicitListingId && normalizedStatus === PartStatus.AVAILABLE) {
            assignmentCandidates = await tx.listing.findMany({
              where: {
                active: true,
                components: {
                  some: {
                    partDetailId: inventoryData.partDetailsId,
                  },
                },
              },
              select: {
                id: true,
                title: true,
              },
              orderBy: {
                createdAt: "asc",
              },
            });
          }

          const autoAssignedListingId =
            assignmentCandidates.length === 1 ? assignmentCandidates[0]?.id ?? null : null;
          const resolvedListingId = explicitListingId ?? autoAssignedListingId;
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
                status: normalizedStatus,
                allocatedToListingId: resolvedListingId,
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
          return {
            createdParts,
            assignment: {
              createdPartIds: createdParts.map((part) => part.id),
              autoAssignedListingId,
              needsSelection: assignmentCandidates.length > 1,
              candidateListings:
                assignmentCandidates.length > 1 ? assignmentCandidates : [],
            },
            syncedListingId:
              normalizedStatus === PartStatus.AVAILABLE ? resolvedListingId : null,
          };
        });

        if (createResult.syncedListingId) {
          await syncEbayQuantityForListing(createResult.syncedListingId).catch((error) => {
            console.error("eBay quantity sync failed after inventory create", error);
          });
        }

        return createResult;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
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
        const updateResult = await ctx.db.$transaction(async (tx) => {
          const existingInventory = await tx.part.findUnique({
            where: { id },
            select: {
              status: true,
              allocatedToListingId: true,
            },
          });

          if (!existingInventory) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: "Inventory item not found",
            });
          }

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

          const allocationChanged =
            existingInventory.allocatedToListingId !==
            updatedInventory.allocatedToListingId;
          const statusChanged = existingInventory.status !== updatedInventory.status;

          const affectedListingIds = new Set<string>();
          if (allocationChanged || statusChanged) {
            if (existingInventory.allocatedToListingId) {
              affectedListingIds.add(existingInventory.allocatedToListingId);
            }
            if (updatedInventory.allocatedToListingId) {
              affectedListingIds.add(updatedInventory.allocatedToListingId);
            }
          }

          return {
            updatedInventory,
            affectedListingIds: [...affectedListingIds],
          };
        });

        if (updateResult.affectedListingIds.length > 0) {
          await Promise.allSettled(
            updateResult.affectedListingIds.map(async (listingId) =>
              syncEbayQuantityForListing(listingId),
            ),
          );
        }

        return updateResult.updatedInventory;
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
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
            allocatedToListingId: true,
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

        if (part.allocatedToListingId) {
          await syncEbayQuantityForListing(part.allocatedToListingId).catch((error) => {
            console.error("eBay quantity sync failed after inventory delete", error);
          });
        }

        return { success: true };
      } catch (error) {
        if (error instanceof TRPCError) {
          throw error;
        }
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Failed to delete inventory item",
          cause: error,
        });
      }
    }),
});
