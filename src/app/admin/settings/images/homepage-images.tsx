"use client";

import { HomepageImageList } from "~/components/HomepageImageList";
import { HomepageImageUploadZone } from "~/components/CloudinaryUpload";
import { api } from "~/trpc/react";

export function HomepageImageManager() {
  const {
    data: images,
    isLoading,
    refetch,
  } = api.homepageImage.getAll.useQuery();

  if (isLoading) {
    return <div className="h-48 animate-pulse rounded-md bg-muted" />;
  }

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium">Upload Images</h3>
        <p className="text-sm text-muted-foreground">
          Upload new images to the homepage carousel. Images will be displayed
          in the order shown below.
        </p>
        <div className="mt-4">
          <HomepageImageUploadZone
            onUploadComplete={() => {
              void refetch();
            }}
          />
        </div>
      </div>

      <div>
        <h3 className="text-lg font-medium">Manage Images</h3>
        <p className="text-sm text-muted-foreground">
          Drag to reorder images or delete them. The order shown here will be
          the order displayed on the homepage.
        </p>
        <div className="mt-4">
          {images && <HomepageImageList images={images} />}
        </div>
      </div>
    </div>
  );
}
