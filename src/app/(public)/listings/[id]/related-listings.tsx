import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "~/lib/utils";

type ListingImage = {
  id: string;
  url: string;
};

type RelatedListing = {
  id: string;
  title: string | null;
  price: number | null;
  images: ListingImage[];
  condition: string | null;
};

interface RelatedListingsProps {
  listings: RelatedListing[];
}

export function RelatedListings({ listings }: RelatedListingsProps) {
  if (!listings || listings.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">You may also like</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
        {listings.map((listing) => (
          <Link
            key={listing.id}
            href={`/listings/${listing.id}`}
            className="group flex flex-col overflow-hidden rounded-md border transition-all hover:shadow-md"
          >
            <div className="relative aspect-square overflow-hidden bg-muted">
              {listing.images[0] ? (
                <Image
                  src={listing.images[0].url}
                  alt={listing.title ?? ""}
                  fill
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 25vw"
                  className="object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full items-center justify-center">
                  <span className="text-sm text-muted-foreground">
                    No image
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-1 flex-col p-3">
              <h3 className="line-clamp-2 font-medium group-hover:text-primary">
                {listing.title}
              </h3>
              <div className="mt-2 flex items-center justify-between">
                <p className="font-semibold text-primary">
                  {formatCurrency(listing.price ?? 0)}
                </p>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
