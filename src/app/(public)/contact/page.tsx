import { ContactCard } from "~/components/contact-card";
import { api } from "~/trpc/server";

export default async function Contact() {
  const page = await api.pages.contact.get();

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <ContactCard data={page} />
      </div>
    </div>
  );
}
