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

export function GalleryFilmstrip({ images, activeIndex, onSelect }: Props) {
  const activeRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [activeIndex]);

  if (images.length <= 1) return null;

  return (
    <div
      className={cn(
        "flex gap-2 overflow-auto",
        // Horizontal strip on mobile, vertical column on md+
        "flex-row md:flex-col",
        "md:max-h-[70vh] md:pr-1",
      )}
    >
      {images.map((image, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={image.id ?? i}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onSelect(i)}
            aria-current={isActive}
            aria-label={`Show image ${i + 1} of ${images.length}`}
            className={cn(
              "relative flex-shrink-0 overflow-hidden rounded-md border-2 bg-muted/30 transition",
              "h-16 w-16 md:h-20 md:w-20",
              isActive
                ? "border-primary"
                : "border-transparent hover:border-muted-foreground/40",
            )}
          >
            <img
              src={cloudinaryUrl(image.url, { width: 200 })}
              alt=""
              className="h-full w-full object-cover"
              loading="lazy"
            />
          </button>
        );
      })}
    </div>
  );
}
