import { type Metadata } from "next";
import { LocationsPage } from "./_components/locations-page";

export const metadata: Metadata = { title: "Inventory Locations" };

export default function Page() {
  return <LocationsPage />;
}
