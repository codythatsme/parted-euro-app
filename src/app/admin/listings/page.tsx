import { type Metadata } from "next";
import { ListingsPage } from "./_components/listings-page";

export const metadata: Metadata = { title: "Listings" };

export default function Page() {
  return <ListingsPage />;
}
