import { TiptapRender } from "~/components/tiptap-render";
import { emptyTiptapDoc, tiptapDocSchema } from "~/lib/tiptap-schema";
import { api } from "~/trpc/server";

export default async function Warranty() {
  const page = await api.pages.warranty.get();
  const parsed = tiptapDocSchema.safeParse(page.body);
  const doc = parsed.success ? parsed.data : emptyTiptapDoc;

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            {page.title}
          </h1>
        </div>
        <div className="mt-12">
          <TiptapRender doc={doc} />
        </div>
      </div>
    </div>
  );
}
