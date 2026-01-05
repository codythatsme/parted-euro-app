import { NextResponse } from "next/server";
import { auth } from "~/server/auth";
import {
  generateSignedUploadParams,
  type UploadEndpoint,
} from "~/lib/cloudinary";
import { z } from "zod";

const requestSchema = z.object({
  endpoint: z.enum(["homepageImage", "inventoryImage", "partImage", "donorImage"]),
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

    const { endpoint, metadata } = parsed.data;

    // Convert metadata to Record<string, string> for signature generation
    const metadataRecord: Record<string, string> = {};
    if (metadata) {
      if (metadata.partNo) metadataRecord.partNo = metadata.partNo;
      if (metadata.fileIndex) metadataRecord.fileIndex = metadata.fileIndex;
      if (metadata.variant) metadataRecord.variant = metadata.variant;
    }

    // Generate signed upload parameters
    const signedParams = generateSignedUploadParams(
      endpoint as UploadEndpoint,
      Object.keys(metadataRecord).length > 0 ? metadataRecord : undefined,
    );

    return NextResponse.json(signedParams);
  } catch (error) {
    console.error("Error generating Cloudinary signature:", error);
    return NextResponse.json(
      { error: "Failed to generate signature" },
      { status: 500 },
    );
  }
}
