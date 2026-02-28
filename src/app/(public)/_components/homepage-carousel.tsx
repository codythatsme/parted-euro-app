"use client";

import Image from "next/image";
import Autoplay from "embla-carousel-autoplay";

import {
  Carousel,
  CarouselContent,
  CarouselItem,
} from "~/components/ui/carousel";
import { type HomepageImage } from "@prisma/client";

export function HomepageCarousel({
  images,
}: {
  images: Partial<HomepageImage>[];
}) {
  return (
    <Carousel
      plugins={[
        Autoplay({
          delay: 10000,
        }),
      ]}
      className="w-full"
      opts={{
        align: "start",
        loop: true,
      }}
    >
      <CarouselContent className="-ml-0">
        {images.map((image) => (
          <CarouselItem key={image.id} className="pl-0">
            <Image
              src={image.url!}
              alt="hero"
              className="h-[90vh] w-full object-cover"
              width={1920}
              height={1080}
              priority
            />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
}
