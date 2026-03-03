import { type Metadata } from "next";
import { PartsPage } from "./_components/parts-page";

export const metadata: Metadata = { title: "Parts" };

export default function Page() {
  return <PartsPage />;
}
