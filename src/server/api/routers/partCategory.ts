import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const partCategoryRouter = createTRPCRouter({
  // Get all part categories
  getAllCategories: publicProcedure.query(async ({ ctx }) => {
    // Based on the schema, the PartTypes table is used for categories
    // with a parent-child relationship for category/subcategory
    const categories = await ctx.db.partTypes.findMany({
      where: {
        // Top-level categories have no parent
        parentId: null,
      },
      include: {
        // Include children as subcategories
        children: true,
      },
      orderBy: {
        name: "asc",
      },
    });

    return categories;
  }),
});
