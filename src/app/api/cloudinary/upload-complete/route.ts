import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { z } from "zod";

const requestSchema = z.object({
  endpoint: z.enum(["homepageImage", "inventoryImage", "partImage", "donorImage"]),
  url: z.string().url(),
  publicId: z.string().optional(),
  metadata: z
    .object({
      partNo: z.string().optional(),
      fileIndex: z.string().optional(),
      variant: z.string().optional(),
    })
    .optional(),
});

export async function POST(request: Request) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user?.isAdmin) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Parse and validate request body
    const body = await request.json();
    const parsed = requestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid request body", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { endpoint, url, metadata } = parsed.data;

    // Handle each endpoint type with its specific database operation
    switch (endpoint) {
      case "homepageImage": {
        // Get the latest order number
        const latestImage = await db.homepageImage.findFirst({
          orderBy: { order: "desc" },
        });

        const order = latestImage ? latestImage.order + 1 : 0;

        // Store the new image in the database
        await db.homepageImage.create({
          data: { url, order },
        });

        return NextResponse.json({ url });
      }

      case "inventoryImage": {
        // Create the image in the database with an order of 0
        const image = await db.image.create({
          data: { url, order: 0 },
        });

        // Return both the URL and the generated ID
        return NextResponse.json({ url, id: image.id });
      }

      case "partImage": {
        const partNo = metadata?.partNo;
        const fileIndexStr = metadata?.fileIndex;
        const variant = metadata?.variant;

        if (!partNo) {
          return NextResponse.json(
            { error: "Part number is required for partImage endpoint" },
            { status: 400 },
          );
        }

        if (!fileIndexStr) {
          return NextResponse.json(
            { error: "File index is required for partImage endpoint" },
            { status: 400 },
          );
        }

        const fileIndex = parseInt(fileIndexStr, 10);
        if (isNaN(fileIndex)) {
          return NextResponse.json(
            { error: "File index must be a number" },
            { status: 400 },
          );
        }

        // Get the highest existing order for this part
        const latestImage = await db.image.findFirst({
          where: { partNo },
          orderBy: { order: "desc" },
        });

        // Calculate the base order (starting point for new uploads)
        const baseOrder = latestImage ? latestImage.order + 1 : 0;

        // The final order is baseOrder + fileIndex (from sorted client array)
        const order = baseOrder + fileIndex;

        // Normalize variant: treat blank as null
        const variantValue = variant && variant.trim() !== "" ? variant : null;

        // Store the image with partNo reference in the database
        await db.image.create({
          data: {
            url,
            partNo,
            order,
            variant: variantValue ?? undefined,
          },
        });

        return NextResponse.json({ url, partNo, order, variant: variantValue });
      }

      case "donorImage": {
        // No database operation for donor images - just return the URL
        return NextResponse.json({ url });
      }

      default:
        return NextResponse.json(
          { error: "Unknown endpoint type" },
          { status: 400 },
        );
    }
  } catch (error) {
    console.error("Error completing Cloudinary upload:", error);
    return NextResponse.json(
      { error: "Failed to complete upload" },
      { status: 500 },
    );
  }
}
