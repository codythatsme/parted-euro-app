import { z } from "zod";
import { adminProcedure, createTRPCRouter, publicProcedure } from "../trpc";
import { tiptapDocSchema } from "~/lib/tiptap-schema";
import {
  defaultContactPage,
  defaultWarrantyPage,
} from "~/server/lib/page-defaults";

const SINGLETON = "singleton";

const contactInputSchema = z.object({
  heading: z.string().min(1).max(120),
  cardTitle: z.string().min(1).max(120),
  address: z.string().min(1).max(500),
  mapsUrl: z.string().url(),
  phoneDisplay: z.string().min(1).max(40),
  phoneHref: z.string().regex(/^tel:/, 'phoneHref must start with "tel:"'),
  email: z.string().email(),
  businessHoursTitle: z.string().min(1).max(120),
  businessHoursNote: z.string().max(200).nullable(),
  businessHoursLines: z.array(z.string().min(1).max(200)).max(20),
});

const warrantyInputSchema = z.object({
  title: z.string().min(1).max(200),
  body: tiptapDocSchema,
});

export const pagesRouter = createTRPCRouter({
  contact: createTRPCRouter({
    get: publicProcedure.query(async ({ ctx }) => {
      const row = await ctx.db.contactPage.findUnique({
        where: { id: SINGLETON },
      });
      return row ?? { id: SINGLETON, ...defaultContactPage, updatedAt: null };
    }),
    update: adminProcedure
      .input(contactInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.db.contactPage.upsert({
          where: { id: SINGLETON },
          create: { id: SINGLETON, ...input },
          update: input,
        }),
      ),
  }),
  warranty: createTRPCRouter({
    get: publicProcedure.query(async ({ ctx }) => {
      const row = await ctx.db.warrantyPage.findUnique({
        where: { id: SINGLETON },
      });
      if (row) {
        const parsed = tiptapDocSchema.safeParse(row.body);
        return {
          id: row.id,
          title: row.title,
          body: parsed.success ? parsed.data : defaultWarrantyPage.body,
          updatedAt: row.updatedAt,
        };
      }
      return { id: SINGLETON, ...defaultWarrantyPage, updatedAt: null };
    }),
    update: adminProcedure
      .input(warrantyInputSchema)
      .mutation(({ ctx, input }) =>
        ctx.db.warrantyPage.upsert({
          where: { id: SINGLETON },
          create: { id: SINGLETON, title: input.title, body: input.body },
          update: { title: input.title, body: input.body },
        }),
      ),
  }),
});
