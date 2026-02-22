"use client";

import * as React from "react";

import Lightbox from "yet-another-react-lightbox";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import "yet-another-react-lightbox/styles.css";
import "yet-another-react-lightbox/plugins/thumbnails.css";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "~/components/ui/carousel";

// Define a more specific image type
type ImageType = {
  id?: string | number;
  url: string;
  alt?: string;
};

interface LightboxCarouselProps extends React.HTMLAttributes<HTMLDivElement> {
  images: ImageType[];
  aspectRatio?: "square" | "auto";
  objectFit?: "cover" | "contain";
  fill?: boolean;
}

export function LightboxCarousel({
  images,
  aspectRatio = "square",
  objectFit = "cover",
  fill = true,
  className,
  ...props
}: LightboxCarouselProps) {
  const [lightboxOpen, setLightboxOpen] = React.useState(false);
  const [currentIndex, setCurrentIndex] = React.useState(0);

  // Don't render anything if there are no images
  if (!images || images.length === 0) {
    return null;
  }

  // Ensure each image has a valid url
  const validImages = images.filter(
    (img): img is ImageType =>
      typeof img === "object" &&
      img !== null &&
      "url" in img &&
      typeof img.url === "string" &&
      !!img.url,
  );

  if (validImages.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-muted">
        <p className="text-sm text-muted-foreground">Images not available</p>
      </div>
    );
  }

  const openLightbox = (index: number) => {
    setCurrentIndex(index);
    setLightboxOpen(true);
  };

  return (
    <div className={className} {...props}>
      <Carousel className="w-full">
        <CarouselContent>
          {validImages.map((image, index) => (
            <CarouselItem key={image.id ?? index}>
              <div
                className={`relative overflow-hidden rounded-md bg-muted ${
                  aspectRatio === "square" ? "aspect-square" : "h-full"
                }`}
              >
                {fill ? (
                  <img
                    src={image.url}
                    alt={image.alt ?? ""}
                    className={`cursor-zoom-in object-${objectFit} h-full w-full transition-transform duration-300 hover:scale-105`}
                    onClick={() => openLightbox(index)}
                  />
                ) : (
                  <img
                    src={image.url}
                    alt={image.alt ?? ""}
                    className={`h-auto w-full cursor-zoom-in object-${objectFit} transition-transform duration-300 hover:scale-105`}
                    onClick={() => openLightbox(index)}
                  />
                )}
              </div>
            </CarouselItem>
          ))}
        </CarouselContent>
        <div className="hidden sm:block">
          <CarouselPrevious className="left-2" />
          <CarouselNext className="right-2" />
        </div>
      </Carousel>

      <Lightbox
        styles={{
          container: { backgroundColor: "rgba(0, 0, 0, .9)" },
          thumbnailsContainer: { backgroundColor: "rgba(0, 0, 0, .9)" },
          thumbnail: { width: "fit" },
        }}
        plugins={[Thumbnails, Zoom]}
        open={lightboxOpen}
        close={() => setLightboxOpen(false)}
        slides={validImages.map((image) => ({ src: image.url }))}
        index={currentIndex}
      />
    </div>
  );
}
