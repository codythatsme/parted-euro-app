import { carRouter } from "~/server/api/routers/car";
import { categoryRouter } from "~/server/api/routers/category";
import { userRouter } from "~/server/api/routers/user";
import { locationRouter } from "~/server/api/routers/location";
import { homepageImageRouter } from "~/server/api/routers/homepage-images";
import { partRouter } from "~/server/api/routers/part";
import { donorRouter } from "~/server/api/routers/donor";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { listingsRouter } from "~/server/api/routers/listings";
import { checkoutRouter } from "./routers/checkout";
import { cartRouter } from "./routers/cart";
import { orderRouter } from "./routers/order";
import { ordersRouter } from "./routers/orders";
import { partCategoryRouter } from "./routers/partCategory";
import { inventoryRouter } from "./routers/inventory";
import { analyticsRouter } from "./routers/analytics";
import { ebayRouter } from "./routers/ebay";
import { xeroRouter } from "./routers/xero";
import { pagesRouter } from "./routers/pages";
/**
 * This is the primary router for your server.
 *
 * All routers added in /api/routers should be manually added here.
 */
export const appRouter = createTRPCRouter({
  car: carRouter,
  category: categoryRouter,
  user: userRouter,
  location: locationRouter,
  homepageImage: homepageImageRouter,
  part: partRouter,
  donor: donorRouter,
  listings: listingsRouter,
  checkout: checkoutRouter,
  cart: cartRouter,
  order: orderRouter,
  orders: ordersRouter,
  partCategory: partCategoryRouter,
  inventory: inventoryRouter,
  analytics: analyticsRouter,
  ebay: ebayRouter,
  xero: xeroRouter,
  pages: pagesRouter,
});

// export type definition of API
export type AppRouter = typeof appRouter;

/**
 * Create a server-side caller for the tRPC API.
 * @example
 * const trpc = createCaller(createContext);
 * const result = await trpc.post.all();
 */
export const createCaller = createCallerFactory(appRouter);
