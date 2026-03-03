import { type Metadata } from "next";
import { SettingsEbayPage } from "./_components/settings-ebay-page";

export const metadata: Metadata = { title: "Settings - eBay" };

export default function Page() {
  return <SettingsEbayPage />;
}
