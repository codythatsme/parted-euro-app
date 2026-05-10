import { type Metadata } from "next";
import { tiptapDocSchema, emptyTiptapDoc } from "~/lib/tiptap-schema";
import { api } from "~/trpc/server";
import { WarrantyForm } from "./_components/warranty-form";

export const metadata: Metadata = { title: "Warranty page" };

export default async function Page() {
  const data = await api.pages.warranty.get();
  const parsed = tiptapDocSchema.safeParse(data.body);
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Warranty page</h1>
      <WarrantyForm
        initial={{
          title: data.title,
          body: parsed.success ? parsed.data : emptyTiptapDoc,
        }}
      />
    </div>
  );
}
