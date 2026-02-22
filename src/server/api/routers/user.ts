import { z } from "zod";
import { adminProcedure, createTRPCRouter, protectedProcedure } from "../trpc";
import { TRPCError } from "@trpc/server";
import { signOut } from "~/server/auth";

export const userRouter = createTRPCRouter({
  // Get all users
  getAll: adminProcedure.query(async ({ ctx }) => {
    // Get all users
    const users = await ctx.db.user.findMany({
      orderBy: { email: "asc" },
    });

    return {
      items: users,
    };
  }),

  // Toggle admin status
  toggleAdmin: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        isAdmin: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, isAdmin } = input;

      // Check if user exists
      const user = await ctx.db.user.findUnique({
        where: { id: userId },
      });

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        });
      }

      // Don't allow removing admin rights from yourself
      if (ctx.session.user.id === userId && !isAdmin) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You cannot remove admin rights from yourself",
        });
      }

      // Update the user's admin status
      const updatedUser = await ctx.db.user.update({
        where: { id: userId },
        data: { isAdmin },
      });

      return updatedUser;
    }),
  signOut: protectedProcedure.mutation(async () => {
    await signOut();
  }),
});
