import { type Metadata } from "next";
import { SettingsImagesPage } from "./_components/settings-images-page";

export const metadata: Metadata = { title: "Settings - Images" };

export default function Page() {
  return <SettingsImagesPage />;
}
