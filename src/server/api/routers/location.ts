import { z } from "zod";
import { adminProcedure, createTRPCRouter } from "../trpc";

// Define location input validation schema
const locationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, "Name is required"),
});

export const locationRouter = createTRPCRouter({
  // Get all locations
  getAll: adminProcedure.query(async ({ ctx }) => {
    // Execute the query to get all locations
    const locations = await ctx.db.inventoryLocations.findMany({
      orderBy: { name: "asc" },
    });

    return {
      items: locations,
    };
  }),

  // Get all locations for inventory form select
  getAllLocations: adminProcedure.query(async ({ ctx }) => {
    const locations = await ctx.db.inventoryLocations.findMany({
      select: {
        id: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return locations.map((location) => ({
      value: location.id,
      label: location.name,
    }));
  }),

  // Get a location by ID
  getById: adminProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { id } = input;
      const location = await ctx.db.inventoryLocations.findUnique({
        where: { id },
      });
      return location;
    }),

  // Create a new location
  create: adminProcedure
    .input(locationSchema)
    .mutation(async ({ ctx, input }) => {
      const location = await ctx.db.inventoryLocations.create({
        data: {
          name: input.name,
        },
      });
      return location;
    }),

  // Update a location
  update: adminProcedure
    .input(z.object({ id: z.string(), data: locationSchema }))
    .mutation(async ({ ctx, input }) => {
      const { id, data } = input;
      const location = await ctx.db.inventoryLocations.update({
        where: { id },
        data: {
          name: data.name,
        },
      });
      return location;
    }),

  // Delete a location
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id } = input;
      await ctx.db.inventoryLocations.delete({
        where: { id },
      });
      return { success: true };
    }),
});
