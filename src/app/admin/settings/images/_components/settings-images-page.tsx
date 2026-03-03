"use client";
import { Separator } from "~/components/ui/separator";
import { HomepageImageManager } from "../homepage-images";
import { Card } from "~/components/ui/card";

export function SettingsImagesPage() {
  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">Image Settings</h1>
      </div>

      <Separator className="my-6" />

      <div className="space-y-8">
        <div>
          <h2 className="text-xl font-semibold">Homepage Carousel</h2>
          <p className="text-sm text-muted-foreground">
            Manage the images that appear in the homepage carousel. Drag to
            reorder.
          </p>

          <Card className="mt-4 p-6">
            <HomepageImageManager />
          </Card>
        </div>
      </div>
    </div>
  );
}
