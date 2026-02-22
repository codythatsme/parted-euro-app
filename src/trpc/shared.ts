import { type inferRouterInputs, type inferRouterOutputs } from "@trpc/server";
import { type AppRouter } from "~/server/api/root";

export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

// return types from the router

export type OrderWithItems = RouterOutputs["order"]["getOrderWithItems"];

// Admin orders types
export type AdminOrdersItem =
  RouterOutputs["orders"]["getAllAdmin"]["items"][number];
export type AdminOrdersResult = RouterOutputs["orders"]["getAllAdmin"];

// Admin cars types
export type AdminCarItem = RouterOutputs["car"]["getAll"]["items"][number];
export type AdminCarsResult = RouterOutputs["car"]["getAll"];
export type AdminCarSeriesOption = RouterOutputs["car"]["getAllSeries"][number];

// Admin inventory types
export type AdminInventoryItem = RouterOutputs["inventory"]["getAll"][number];
export type AdminInventoryResult = RouterOutputs["inventory"]["getAll"];

// Admin listings types
export type AdminListingsItem =
  RouterOutputs["listings"]["getAllAdmin"]["items"][number];
export type AdminListingsResult = RouterOutputs["listings"]["getAllAdmin"];
export type PublicListingItem = RouterOutputs["listings"]["getListing"];
export type ListingSearchItem =
  RouterOutputs["listings"]["searchListings"]["listings"][number];
export type ListingStockResult = RouterOutputs["listings"]["getStock"];
