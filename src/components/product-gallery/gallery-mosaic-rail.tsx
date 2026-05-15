"use client";

import * as React from "react";
import { cn } from "~/lib/utils";
import { cloudinaryUrl } from "~/lib/cloudinary-url";
import type { GalleryImage } from "./types";

type Props = {
  images: GalleryImage[];
  activeIndex: number;
  onSelect: (i: number) => void;
};

export function GalleryMosaicRail({ images, activeIndex, onSelect }: Props) {
  return (
    <div
      className="pointer-events-auto flex h-full w-full flex-col bg-black/85 p-3"
      aria-label="Gallery thumbnails"
    >
      <div
        className="grid grid-cols-2 gap-2 overflow-y-auto"
        style={{ gridAutoRows: "min-content" }}
      >
        {images.map((image, i) => {
          const isActive = i === activeIndex;
          const aspect =
            image.width && image.height
              ? `${image.width} / ${image.height}`
              : "1 / 1";
          return (
            <button
              key={image.id ?? i}
              type="button"
              onClick={() => onSelect(i)}
              aria-current={isActive}
              aria-label={`Show image ${i + 1} of ${images.length}`}
              className={cn(
                "overflow-hidden rounded border-2 transition",
                isActive
                  ? "border-white"
                  : "border-transparent hover:border-white/50",
              )}
              style={{ aspectRatio: aspect }}
            >
              <img
                src={cloudinaryUrl(image.url, { width: 400 })}
                alt=""
                className="h-full w-full object-cover"
                loading="lazy"
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
