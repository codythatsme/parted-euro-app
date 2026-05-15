"use client";

import { api } from "~/trpc/react";
import { useSelectedCarStore } from "~/stores/useSelectedCarStore";
import { RelatedListings } from "./related-listings";

type Props = {
  listingId: string;
  fallbackCar: { generation: string; model: string };
};

export function RelatedListingsSection({ listingId, fallbackCar }: Props) {
  const selectedCar = useSelectedCarStore((s) => s.selectedCar);

  // Prefer the user's selected car when it carries the generation+model the
  // related-listings query needs; otherwise fall back to this listing's first
  // compatible car.
  const car =
    selectedCar?.generation && selectedCar?.model
      ? { generation: selectedCar.generation, model: selectedCar.model }
      : fallbackCar;

  const { data } = api.listings.getRelatedListings.useQuery({
    id: listingId,
    generation: car.generation,
    model: car.model,
  });

  if (!data || data.length === 0) return null;

  return <RelatedListings listings={data} />;
}
