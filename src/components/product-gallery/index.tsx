"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { Gallery, useGallery } from "react-photoswipe-gallery";
import type PhotoSwipe from "photoswipe";
import type { DataSource } from "react-photoswipe-gallery";
import "photoswipe/style.css";

import { cn } from "~/lib/utils";
import { mediaUrl } from "~/lib/media-url";
import { GalleryHero } from "./gallery-hero";
import { GalleryFilmstrip } from "./gallery-filmstrip";
import { GalleryMosaicRail } from "./gallery-mosaic-rail";
import type { GalleryImage } from "./types";

const FALLBACK_DIM = 1600;

type Props = {
  images: GalleryImage[];
  className?: string;
};

export function ProductGallery({ images, className }: Props) {
  if (images.length === 0) {
    return (
      <div className="flex aspect-[4/3] items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">No images available</p>
      </div>
    );
  }

  return (
    <ProductGalleryInner images={images} className={className} />
  );
}

function ProductGalleryInner({ images, className }: Props) {
  const [activeIndex, setActiveIndex] = React.useState(0);
  // Probed natural sizes for images that lack stored width/height.
  const [probedSizes, setProbedSizes] = React.useState<
    Record<string, { width: number; height: number }>
  >({});

  // Preload natural dimensions for any image that doesn't have stored width/height.
  // Needed for PhotoSwipe deep zoom on legacy rows uploaded before width/height was tracked.
  React.useEffect(() => {
    const cancelled = { current: false };
    images.forEach((img) => {
      if (img.width && img.height) return;
      if (probedSizes[img.url]) return;
      const probe = new window.Image();
      probe.onload = () => {
        if (cancelled.current) return;
        if (probe.naturalWidth > 0 && probe.naturalHeight > 0) {
          setProbedSizes((prev) =>
            prev[img.url]
              ? prev
              : {
                  ...prev,
                  [img.url]: {
                    width: probe.naturalWidth,
                    height: probe.naturalHeight,
                  },
                },
          );
        }
      };
      probe.src = mediaUrl(img.url, { width: 2400 });
    });
    return () => {
      cancelled.current = true;
    };
  }, [images, probedSizes]);
  const [railContainer, setRailContainer] =
    React.useState<HTMLElement | null>(null);
  const pswpRef = React.useRef<PhotoSwipe | null>(null);
  const [pswpActiveIndex, setPswpActiveIndex] = React.useState(0);

  const dimsFor = React.useCallback(
    (img: GalleryImage): { width: number; height: number } => {
      if (img.width && img.height) {
        return { width: img.width, height: img.height };
      }
      const probe = probedSizes[img.url];
      if (probe) return probe;
      return { width: FALLBACK_DIM, height: FALLBACK_DIM };
    },
    [probedSizes],
  );

  const dataSource: DataSource = React.useMemo(
    () =>
      images.map((img, i) => {
        const { width, height } = dimsFor(img);
        return {
          src: mediaUrl(img.url, { width: 2400 }),
          width,
          height,
          alt: img.alt,
          sourceId: img.id ?? `gallery-${i}`,
        };
      }),
    [images, dimsFor],
  );

  // react-photoswipe-gallery's `open` callback omits dataSource from its
  // useCallback deps, so it closes over whatever dataSource was passed in on
  // the render where it last reinitialized. We force a remount via `galleryKey`
  // when dims meaningfully change, so PhotoSwipe always opens with current dims.
  const galleryKey = React.useMemo(
    () => dataSource.map((d) => `${d.sourceId}:${d.width}x${d.height}`).join("|"),
    [dataSource],
  );

  const enrichedImages = React.useMemo(
    () =>
      images.map((img) => {
        if (img.width && img.height) return img;
        const probe = probedSizes[img.url];
        return probe ? { ...img, width: probe.width, height: probe.height } : img;
      }),
    [images, probedSizes],
  );

  const handleNaturalSize = React.useCallback(
    (url: string, size: { width: number; height: number }) => {
      setProbedSizes((prev) => (prev[url] ? prev : { ...prev, [url]: size }));
    },
    [],
  );

  const showMosaic = images.length > 1;

  const uiElements = React.useMemo(
    () =>
      showMosaic
        ? [
            {
              name: "mosaic-rail",
              order: 9,
              isButton: false,
              appendTo: "wrapper" as const,
              html: "",
              onInit: (el: HTMLElement, pswp: PhotoSwipe) => {
                el.className = "pswp__mosaic-rail";
                el.style.position = "absolute";
                el.style.top = "60px";
                el.style.right = "0";
                el.style.bottom = "0";
                el.style.width = "min(280px, 30vw)";
                el.style.zIndex = "1050";
                pswpRef.current = pswp;
                setRailContainer(el);
                setPswpActiveIndex(pswp.currIndex);
                pswp.on("change", () => setPswpActiveIndex(pswp.currIndex));
                pswp.on("destroy", () => {
                  pswpRef.current = null;
                  setRailContainer(null);
                });
              },
            },
          ]
        : [],
    [showMosaic],
  );

  return (
    <Gallery
      key={galleryKey}
      dataSource={dataSource}
      uiElements={uiElements}
      options={{
        wheelToZoom: true,
        bgOpacity: 1,
        // Leave room on the right for the mosaic rail
        paddingFn: (viewportSize) =>
          showMosaic && viewportSize.x >= 768
            ? { top: 60, bottom: 20, left: 20, right: Math.min(280, viewportSize.x * 0.3) + 20 }
            : { top: 60, bottom: 20, left: 20, right: 20 },
      }}
    >
      <GalleryRenderer
        images={enrichedImages}
        activeIndex={activeIndex}
        setActiveIndex={setActiveIndex}
        onNaturalSize={handleNaturalSize}
        className={className}
      />
      {railContainer &&
        createPortal(
          <GalleryMosaicRail
            images={enrichedImages}
            activeIndex={pswpActiveIndex}
            onSelect={(i) => pswpRef.current?.goTo(i)}
          />,
          railContainer,
        )}
    </Gallery>
  );
}

type RendererProps = {
  images: GalleryImage[];
  activeIndex: number;
  setActiveIndex: (i: number) => void;
  onNaturalSize: (url: string, size: { width: number; height: number }) => void;
  className?: string;
};

function GalleryRenderer({
  images,
  activeIndex,
  setActiveIndex,
  onNaturalSize,
  className,
}: RendererProps) {
  const { open } = useGallery();
  const active = images[activeIndex] ?? images[0];
  if (!active) return null;

  const handlePrev = () =>
    setActiveIndex((activeIndex - 1 + images.length) % images.length);
  const handleNext = () => setActiveIndex((activeIndex + 1) % images.length);

  return (
    <div className={cn("flex flex-col gap-3 md:flex-row", className)}>
      <div className="order-2 md:order-1">
        <GalleryFilmstrip
          images={images}
          activeIndex={activeIndex}
          onSelect={setActiveIndex}
        />
      </div>
      <div className="order-1 min-w-0 flex-1 md:order-2">
        <GalleryHero
          image={active}
          total={images.length}
          index={activeIndex}
          onPrev={handlePrev}
          onNext={handleNext}
          onOpenFullscreen={() => open(activeIndex)}
          onNaturalSize={(size) => onNaturalSize(active.url, size)}
        />
      </div>
    </div>
  );
}
