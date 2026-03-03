import { type Metadata } from "next";
import { SettingsXeroPage } from "./_components/settings-xero-page";

export const metadata: Metadata = { title: "Settings - Xero" };

export default function Page() {
  return <SettingsXeroPage />;
}
