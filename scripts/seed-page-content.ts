/**
 * Upserts the ContactPage and WarrantyPage singletons with the canonical
 * content migrated from the old hardcoded /contact and /returns-refunds pages.
 *
 * Run: bun run scripts/seed-page-content.ts
 */
import { db } from "../src/server/db";
import {
  defaultContactPage,
  defaultWarrantyPage,
} from "../src/server/lib/page-defaults";
import { tiptapDocSchema } from "../src/lib/tiptap-schema";

const SINGLETON = "singleton";

async function main() {
  const parsed = tiptapDocSchema.safeParse(defaultWarrantyPage.body);
  if (!parsed.success) {
    console.error("Default warranty body fails Tiptap schema:");
    console.error(parsed.error.format());
    process.exit(1);
  }

  await db.contactPage.upsert({
    where: { id: SINGLETON },
    create: { id: SINGLETON, ...defaultContactPage },
    update: defaultContactPage,
  });
  console.log("Seeded ContactPage");

  await db.warrantyPage.upsert({
    where: { id: SINGLETON },
    create: {
      id: SINGLETON,
      title: defaultWarrantyPage.title,
      body: defaultWarrantyPage.body,
    },
    update: {
      title: defaultWarrantyPage.title,
      body: defaultWarrantyPage.body,
    },
  });
  console.log("Seeded WarrantyPage");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
