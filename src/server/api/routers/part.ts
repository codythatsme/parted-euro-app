import { z } from "zod";
import { type Prisma } from "@prisma/client";
import { TRPCError } from "@trpc/server";
import { adminProcedure, createTRPCRouter } from "../trpc";

// Define part input validation schema
const partDetailSchema = z.object({
  partNo: z.string().trim().min(1, "Part number is required"),
  alternatePartNumbers: z.string().optional(),
  name: z.string().min(1, "Name is required"),
  weight: z.number().min(0, "Weight must be a positive number"),
  length: z.number().min(0, "Length must be a positive number"),
  width: z.number().min(0, "Width must be a positive number"),
  height: z.number().min(0, "Height must be a positive number"),
  costPrice: z
    .number()
    .min(0, "Cost price must be a positive number")
    .optional(),
  cars: z.array(z.string()).optional(),
  partTypes: z.array(z.string()).optional(),
});

export const partRouter = createTRPCRouter({
  // Get all parts
  getAll: adminProcedure.query(async ({ ctx }) => {
    // Execute the query
    const parts = await ctx.db.partDetail.findMany({
      include: {
        cars: {
          select: {
            id: true,
            make: true,
            model: true,
            series: true,
            generation: true,
          },
        },
        partTypes: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return {
      items: parts,
    };
  }),

  // Get all compatible cars for multiselect
  getAllCars: adminProcedure.query(async ({ ctx }) => {
    const cars = await ctx.db.car.findMany({
      select: {
        id: true,
        make: true,
        model: true,
        series: true,
        body: true,
        generation: true,
      },
      orderBy: [{ make: "asc" }, { model: "asc" }],
    });

    return cars.map((car) => ({
      value: car.id,
      label: `${car.make} ${car.model} (${car.series} ${car.generation}) ${car.body ? `// ${car.body}` : ""}`,
      make: car.make,
      series: car.series,
      generation: car.generation,
      model: car.model,
    }));
  }),

  // Get all part types for multiselect
  getAllPartTypes: adminProcedure.query(async ({ ctx }) => {
    const partTypes = await ctx.db.partTypes.findMany({
      where: {
        NOT: {
          parent: null,
        },
      },
      select: {
        id: true,
        name: true,
        parent: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return partTypes.map((type) => ({
      value: type.id,
      label: `${type.parent?.name} - ${type.name}`,
    }));
  }),

  // Get all part details for inventory form select
  getAllPartDetails: adminProcedure.query(async ({ ctx }) => {
    const partDetails = await ctx.db.partDetail.findMany({
      select: {
        partNo: true,
        name: true,
      },
      orderBy: { name: "asc" },
    });

    return partDetails.map((part) => ({
      value: part.partNo,
      label: `${part.name} (${part.partNo})`,
    }));
  }),

  // Search parts by part number or name
  searchByPartNo: adminProcedure
    .input(
      z.object({
        search: z.string().trim().optional(),
        limit: z.number().min(1).max(50).optional().default(10),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { search, limit } = input;

      if (!search || search.length < 2) {
        return [];
      }

      const parts = await ctx.db.partDetail.findMany({
        where: {
          OR: [
            { partNo: { contains: search, mode: "insensitive" } },
            { name: { contains: search, mode: "insensitive" } },
            { alternatePartNumbers: { contains: search, mode: "insensitive" } },
          ],
        },
        select: {
          partNo: true,
          name: true,
        },
        take: limit,
        orderBy: { name: "asc" },
      });

      return parts.map((part) => ({
        value: part.partNo,
        label: `${part.name} (${part.partNo})`,
      }));
    }),

  // Get a part by ID
  getById: adminProcedure
    .input(z.object({ partNo: z.string().trim() }))
    .query(async ({ ctx, input }) => {
      const { partNo } = input;
      const part = await ctx.db.partDetail.findUnique({
        where: { partNo },
        include: {
          cars: true,
          partTypes: true,
        },
      });
      return part;
    }),

  // Create a new part
  create: adminProcedure
    .input(partDetailSchema)
    .mutation(async ({ ctx, input }) => {
      const { cars = [], partTypes = [], ...partData } = input;

      const part = await ctx.db.partDetail.create({
        data: {
          ...partData,
          cars: {
            connect: cars.map((id) => ({ id })),
          },
          partTypes: {
            connect: partTypes.map((id) => ({ id })),
          },
        },
        include: {
          cars: true,
          partTypes: true,
        },
      });
      return part;
    }),

  // Update a part
  update: adminProcedure
    .input(
      z.object({
        partNo: z.string().trim(),
        data: partDetailSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { partNo, data } = input;
      const { cars = [], partTypes = [], ...updateData } = data;

      // Verify the part exists before attempting update
      const existing = await ctx.db.partDetail.findUnique({
        where: { partNo },
        select: { partNo: true },
      });

      if (!existing) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Part "${partNo}" no longer exists. It may have been deleted.`,
        });
      }

      // First disconnect all existing relationships
      await ctx.db.partDetail.update({
        where: { partNo },
        data: {
          cars: {
            set: [],
          },
          partTypes: {
            set: [],
          },
        },
      });

      // Then update with new connections
      const part = await ctx.db.partDetail.update({
        where: { partNo },
        data: {
          ...updateData,
          cars: {
            connect: cars.map((id) => ({ id })),
          },
          partTypes: {
            connect: partTypes.map((id) => ({ id })),
          },
        },
        include: {
          cars: true,
          partTypes: true,
        },
      });
      return part;
    }),

  // Delete a part
  delete: adminProcedure
    .input(z.object({ partNo: z.string().trim() }))
    .mutation(async ({ ctx, input }) => {
      const { partNo } = input;
      await ctx.db.partDetail.delete({
        where: { partNo },
      });
      return { success: true };
    }),

  // Get images by partNo
  getImagesByPartNo: adminProcedure
    .input(z.object({ partNo: z.string().trim() }))
    .query(async ({ ctx, input }) => {
      const { partNo } = input;
      const images = await ctx.db.image.findMany({
        where: { partNo, partId: null },
        orderBy: [{ variant: "asc" }, { order: "asc" }],
        select: {
          id: true,
          url: true,
          order: true,
          partNo: true,
          variant: true,
        },
      });
      return images;
    }),

  // Delete a part image
  deleteImage: adminProcedure
    .input(z.object({ imageId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { imageId } = input;
      await ctx.db.image.delete({
        where: { id: imageId },
      });
      return { success: true };
    }),
});
