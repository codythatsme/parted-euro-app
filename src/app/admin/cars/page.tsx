import { type Metadata } from "next";
import { CarsPage } from "./_components/cars-page";

export const metadata: Metadata = { title: "Cars" };

export default function Page() {
  return <CarsPage />;
}
