import { type Metadata } from "next";
import { SettingsPage } from "./_components/settings-page";

export const metadata: Metadata = { title: "Settings" };

export default function Page() {
  return <SettingsPage />;
}
