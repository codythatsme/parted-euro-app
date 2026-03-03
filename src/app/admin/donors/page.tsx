import { type Metadata } from "next";
import { DonorsPage } from "./_components/donors-page";

export const metadata: Metadata = { title: "Donors" };

export default function Page() {
  return <DonorsPage />;
}
