/**
 * Read-only profiling of every image-bearing field in the DB.
 * Prints aggregate counts + URL host/path patterns. No secrets, no writes.
 * Run: bun run scripts/analyze-image-urls.ts
 */
import { db } from "~/server/db";

function host(u: string): string {
  try {
    return new URL(u).host;
  } catch {
    return `<<unparseable:${u.slice(0, 40)}>>`;
  }
}

// Cloudinary URL shape: https://res.cloudinary.com/<cloud>/image/upload/[transforms/]v<ver>/<folder>/<public_id>.<ext>
function cloudinaryShape(u: string): string {
  const i = u.indexOf("/image/upload/");
  if (i === -1) return "NON_UPLOAD_PATH";
  const tail = u.slice(i + "/image/upload/".length);
  const seg0 = tail.split("/")[0] ?? "";
  const hasVersion = /^v\d+$/.test(seg0) || /\/v\d+\//.test("/" + tail);
  const hasTransform = /(^|,)[a-z]_/i.test(seg0);
  return `${hasTransform ? "T+" : ""}${hasVersion ? "ver" : "nover"}`;
}

function tallyHosts(urls: string[]): Record<string, number> {
  const m: Record<string, number> = {};
  for (const u of urls) m[host(u)] = (m[host(u)] ?? 0) + 1;
  return m;
}

async function main() {
  const out: Record<string, unknown> = {};

  // ---- Image table ----
  const images = await db.image.findMany({
    select: { id: true, url: true, partId: true, listingId: true, donorVin: true, partNo: true },
  });
  out.imageTable = {
    total: images.length,
    hosts: tallyHosts(images.map((i) => i.url)),
    cloudinaryShapes: images
      .filter((i) => host(i.url).includes("cloudinary"))
      .reduce<Record<string, number>>((acc, i) => {
        const s = cloudinaryShape(i.url);
        acc[s] = (acc[s] ?? 0) + 1;
        return acc;
      }, {}),
    withPart: images.filter((i) => i.partId).length,
    withListing: images.filter((i) => i.listingId).length,
    withDonor: images.filter((i) => i.donorVin).length,
    withPartNoOnly: images.filter((i) => !i.partId && !i.listingId && !i.donorVin && i.partNo).length,
    orphan: images.filter((i) => !i.partId && !i.listingId && !i.donorVin && !i.partNo).length,
    samples: images.slice(0, 5).map((i) => i.url),
  };

  // ---- HomepageImage table ----
  const home = await db.homepageImage.findMany({ select: { url: true } });
  out.homepageImage = {
    total: home.length,
    hosts: tallyHosts(home.map((h) => h.url)),
    samples: home.slice(0, 3).map((h) => h.url),
  };

  // ---- ContactPage.heroImageUrl ----
  const contact = await db.contactPage.findMany({ select: { id: true, heroImageUrl: true } });
  out.contactPage = contact.map((c) => ({ id: c.id, heroImageUrl: c.heroImageUrl }));

  // ---- User.image (likely OAuth avatars, report only) ----
  const users = await db.user.findMany({ select: { image: true } });
  out.userImage = {
    total: users.filter((u) => u.image).length,
    hosts: tallyHosts(users.filter((u) => u.image).map((u) => u.image ?? "")),
  };

  // ---- Embedded URLs in text fields ----
  const urlRe = /https?:\/\/[^\s"'<>)]+/g;
  const cldOrUt = (s: string) =>
    (s.match(urlRe) ?? []).filter((u) => /cloudinary|utfs\.io/.test(u));

  const listings = await db.listing.findMany({ select: { id: true, description: true } });
  const descHits = listings.flatMap((l) => cldOrUt(l.description).map((u) => ({ id: l.id, u })));
  out.listingDescriptionEmbeds = {
    listingsScanned: listings.length,
    listingsWithEmbeds: new Set(descHits.map((h) => h.id)).size,
    totalEmbedUrls: descHits.length,
    hosts: tallyHosts(descHits.map((h) => h.u)),
    samples: descHits.slice(0, 5),
  };

  const ebaySettings = await db.ebaySettings.findMany({ select: { id: true, listingTemplate: true } });
  out.ebaySettingsTemplateEmbeds = ebaySettings.map((e) => ({
    id: e.id,
    embeds: cldOrUt(e.listingTemplate),
  }));

  console.log(JSON.stringify(out, null, 2));
  await db.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
