import { NextResponse } from "next/server";
import { imageSize } from "image-size";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
  buildMediaKey,
  extForContentType,
  mediaPublicUrl,
  putMedia,
} from "~/lib/r2";
import {
  UPLOAD_ENDPOINTS,
  type UploadEndpoint,
} from "~/lib/media-endpoints";

// Bytes pass through this serverless function, so keep it on the Node runtime
// and give large compressed images room to finish.
export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_FILE_SIZE = 16 * 1024 * 1024; // 16MB, matches the client validator.

const metadataSchema = z.object({
  partNo: z.string().optional(),
  fileIndex: z.string().optional(),
  variant: z.string().optional(),
});

function isUploadEndpoint(value: string): value is UploadEndpoint {
  return UPLOAD_ENDPOINTS.some((endpoint) => endpoint === value);
}

function badRequest(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export async function POST(request: Request) {
  try {
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return badRequest("Unauthorized", 401);
    }

    const form = await request.formData();

    const endpointRaw = form.get("endpoint");
    if (typeof endpointRaw !== "string" || !isUploadEndpoint(endpointRaw)) {
      return badRequest("Invalid or missing endpoint");
    }
    const endpoint = endpointRaw;

    const file = form.get("file");
    if (!(file instanceof File)) {
      return badRequest("Missing file");
    }
    if (file.size === 0) {
      return badRequest("Empty file");
    }
    if (file.size > MAX_FILE_SIZE) {
      return badRequest("File exceeds 16MB limit", 413);
    }
    if (!file.type.startsWith("image/")) {
      return badRequest("File is not an image");
    }

    const metadataRaw = form.get("metadata");
    let metadata: z.infer<typeof metadataSchema> = {};
    if (typeof metadataRaw === "string" && metadataRaw.length > 0) {
      let raw: unknown;
      try {
        raw = JSON.parse(metadataRaw);
      } catch {
        return badRequest("Invalid metadata");
      }
      const parsed = metadataSchema.safeParse(raw);
      if (!parsed.success) {
        return badRequest("Invalid metadata");
      }
      metadata = parsed.data;
    }

    const body = Buffer.from(await file.arrayBuffer());
    const contentType = file.type;

    // Best-effort intrinsic dimensions; not all formats are supported.
    let width: number | undefined;
    let height: number | undefined;
    try {
      const dims = imageSize(body);
      width = dims.width;
      height = dims.height;
    } catch {
      // leave width/height undefined
    }

    const key = buildMediaKey(endpoint, extForContentType(contentType));
    await putMedia({ key, body, contentType });
    const url = mediaPublicUrl(key);

    switch (endpoint) {
      case "homepageImage": {
        const latestImage = await db.homepageImage.findFirst({
          orderBy: { order: "desc" },
        });
        const order = latestImage ? latestImage.order + 1 : 0;
        await db.homepageImage.create({ data: { url, order } });
        return NextResponse.json({ url });
      }

      case "inventoryImage": {
        const image = await db.image.create({
          data: { url, order: 0, width, height },
        });
        return NextResponse.json({ url, id: image.id });
      }

      case "partImage": {
        const partNo = metadata.partNo;
        const fileIndexStr = metadata.fileIndex;
        const variant = metadata.variant;

        if (!partNo) {
          return badRequest("Part number is required for partImage endpoint");
        }
        if (!fileIndexStr) {
          return badRequest("File index is required for partImage endpoint");
        }
        const fileIndex = parseInt(fileIndexStr, 10);
        if (isNaN(fileIndex)) {
          return badRequest("File index must be a number");
        }

        const latestImage = await db.image.findFirst({
          where: { partNo },
          orderBy: { order: "desc" },
        });
        const baseOrder = latestImage ? latestImage.order + 1 : 0;
        const order = baseOrder + fileIndex;
        const variantValue = variant && variant.trim() !== "" ? variant : null;

        const image = await db.image.create({
          data: {
            url,
            partNo,
            order,
            variant: variantValue,
            width,
            height,
          },
        });
        return NextResponse.json({
          url,
          id: image.id,
          partNo,
          order,
          variant: variantValue,
        });
      }

      case "donorImage":
        // No DB write; the donor form persists URLs when the donor is saved.
        return NextResponse.json({ url });

      case "contactImage":
        // No DB write; the contact form persists the URL via pages.contact.update.
        return NextResponse.json({ url });
    }
  } catch (error) {
    console.error("Error handling media upload:", error);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }
}
