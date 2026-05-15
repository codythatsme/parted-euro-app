"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import { cn } from "~/lib/utils";
import { cloudinaryUrl, cloudinarySrcSet } from "~/lib/cloudinary-url";
import type { GalleryImage } from "./types";

const ZOOM_SCALE = 2.75;

type Props = {
  image: GalleryImage;
  total: number;
  index: number;
  onPrev: () => void;
  onNext: () => void;
  onOpenFullscreen: () => void;
  onNaturalSize?: (size: { width: number; height: number }) => void;
};

export function GalleryHero({
  image,
  total,
  index,
  onPrev,
  onNext,
  onOpenFullscreen,
  onNaturalSize,
}: Props) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const imgRef = React.useRef<HTMLImageElement>(null);
  const rafRef = React.useRef<number | null>(null);
  const [zoomed, setZoomed] = React.useState(false);
  const [origin, setOrigin] = React.useState({ x: 50, y: 50 });

  React.useEffect(() => {
    setZoomed(false);
  }, [image.url]);

  const updateOriginFromEvent = React.useCallback(
    (clientX: number, clientY: number) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const x = ((clientX - rect.left) / rect.width) * 100;
      const y = ((clientY - rect.top) / rect.height) * 100;
      setOrigin({
        x: Math.max(0, Math.min(100, x)),
        y: Math.max(0, Math.min(100, y)),
      });
    },
    [],
  );

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!zoomed) return;
    const { clientX, clientY } = e;
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() =>
      updateOriginFromEvent(clientX, clientY),
    );
  };

  const handleClick = (e: React.MouseEvent) => {
    updateOriginFromEvent(e.clientX, e.clientY);
    setZoomed((z) => !z);
  };

  const handleLoad = () => {
    const img = imgRef.current;
    if (!img || !onNaturalSize) return;
    if (img.naturalWidth > 0 && img.naturalHeight > 0) {
      onNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  };

  React.useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  const idleSrc = cloudinaryUrl(image.url, { width: 1200 });
  const zoomedSrc = cloudinaryUrl(image.url, { width: 2000 });

  return (
    <div className="relative w-full">
      <div
        ref={containerRef}
        className={cn(
          "group relative flex items-center justify-center overflow-hidden bg-muted/30",
          "aspect-[4/3] md:aspect-auto md:max-h-[70vh] md:min-h-[420px]",
        )}
      >
        <button
          type="button"
          onClick={handleClick}
          onMouseMove={handleMouseMove}
          onMouseLeave={() => zoomed && setZoomed(false)}
          aria-pressed={zoomed}
          aria-label={zoomed ? "Exit zoom" : "Click to zoom in"}
          className={cn(
            "absolute inset-0 h-full w-full",
            "hidden md:block",
            zoomed ? "cursor-zoom-out" : "cursor-zoom-in",
          )}
        >
          <img
            ref={imgRef}
            src={zoomed ? zoomedSrc : idleSrc}
            srcSet={
              zoomed ? undefined : cloudinarySrcSet(image.url, [600, 1200, 2000])
            }
            sizes="(min-width: 768px) 50vw, 100vw"
            alt={image.alt ?? ""}
            onLoad={handleLoad}
            draggable={false}
            className={cn(
              "h-full w-full select-none object-contain transition-transform duration-200 ease-out",
            )}
            style={{
              transform: zoomed ? `scale(${ZOOM_SCALE})` : "none",
              transformOrigin: `${origin.x}% ${origin.y}%`,
            }}
          />
        </button>

        {/* Mobile: plain image, no inline zoom (use fullscreen for pinch) */}
        <img
          src={idleSrc}
          srcSet={cloudinarySrcSet(image.url, [600, 1200])}
          sizes="100vw"
          alt={image.alt ?? ""}
          onLoad={handleLoad}
          onClick={onOpenFullscreen}
          className="block h-full w-full cursor-zoom-in object-contain md:hidden"
        />

        {total > 1 && (
          <>
            <button
              type="button"
              onClick={onPrev}
              aria-label="Previous image"
              className={cn(
                "absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur",
                "opacity-0 transition-opacity group-hover:opacity-100",
                "focus-visible:opacity-100 hover:bg-background",
              )}
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={onNext}
              aria-label="Next image"
              className={cn(
                "absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full bg-background/80 p-2 shadow-md backdrop-blur",
                "opacity-0 transition-opacity group-hover:opacity-100",
                "focus-visible:opacity-100 hover:bg-background",
              )}
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </>
        )}

        <button
          type="button"
          onClick={onOpenFullscreen}
          aria-label="Open fullscreen gallery"
          className="absolute right-2 top-2 z-10 rounded-full bg-background/80 p-2 shadow-md backdrop-blur transition hover:bg-background"
        >
          <Maximize2 className="h-4 w-4" />
        </button>

        {total > 1 && (
          <div className="absolute bottom-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium tabular-nums shadow-md backdrop-blur">
            {index + 1} / {total}
          </div>
        )}
      </div>
    </div>
  );
}
