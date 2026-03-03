import { type Metadata } from "next";
import { CreateOrderPage } from "./_components/create-order-page";

export const metadata: Metadata = { title: "Create Order" };

export default function Page() {
  return <CreateOrderPage />;
}
