import { type Metadata } from "next";
import { api } from "~/trpc/server";
import { ContactForm } from "./_components/contact-form";

export const metadata: Metadata = { title: "Contact page" };

export default async function Page() {
  const data = await api.pages.contact.get();
  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Contact page</h1>
      <ContactForm initial={data} />
    </div>
  );
}
