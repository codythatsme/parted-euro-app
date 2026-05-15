import { type Metadata } from "next";
import { api } from "~/trpc/server";
import { notFound } from "next/navigation";
import { formatCurrency } from "~/lib/utils";
import { Separator } from "~/components/ui/separator";
import { Badge } from "~/components/ui/badge";
import { AddToCart } from "./add-to-cart";
import { InteractiveCompatibleCars } from "./interactive-compatible-cars";
import { RelatedListings } from "./related-listings";
import { ListingAnalytics } from "./listing-analytics";
import { ProductGallery } from "~/components/product-gallery";

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    make?: string;
    series?: string;
    generation?: string;
    model?: string;
  }>;
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  // read route params
  const { id } = await params;

  // fetch data
  const listing = await api.listings.getListingMetadata({ id });

  if (!listing) {
    return {
      title: "Listing Not Found",
      description: "The requested listing could not be found.",
    };
  }

  return {
    title: listing.title,
    description: listing.description,
    openGraph: {
      images: [listing?.images[0]?.url ?? ""],
    },
  };
}

export default async function ListingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const sp = await searchParams;
  const listing = await api.listings.getListing({ id });

  if (!listing) {
    notFound();
  }

  const { title, description, price, images, components, allocatedParts, stock } =
    listing;
  const quantity = stock ?? 0;
  const inStock = quantity > 0;

  // Format images to ensure consistent structure
  const formattedImages =
    images && images.length > 0
      ? images.map((img) => ({
          id: img.id,
          url: img.url,
          alt: title ?? "",
          width: img.width,
          height: img.height,
        }))
      : [];

  const firstComponent = components?.[0];

  // Extract all compatible cars from components.
  const compatibleCars =
    components?.flatMap((component) => component.partDetail?.cars ?? []) ?? [];

  // Deduplicate cars by id
  const uniqueCompatibleCars = compatibleCars.filter(
    (car, index, self) => index === self.findIndex((c) => c.id === car.id),
  );

  // Prefer the car the user selected on the listings screen (passed via URL).
  // Fall back to the first compatible car on the listing.
  const firstCar = uniqueCompatibleCars[0];
  const selectedCar =
    sp.generation && sp.model
      ? { generation: sp.generation, model: sp.model }
      : null;
  const relatedListings = await api.listings.getRelatedListings({
    id,
    generation: selectedCar?.generation ?? firstCar?.generation ?? "",
    model: selectedCar?.model ?? firstCar?.model ?? "",
  });

  return (
    <div className="container mx-auto px-4 py-8 md:py-12">
      <ListingAnalytics listingId={id} />

      <div className="grid gap-8 md:grid-cols-2">
        {/* Image gallery */}
        <ProductGallery images={formattedImages} />


        {/* Product details */}
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold sm:text-3xl">{title}</h1>

          <div className="mt-2 flex items-center gap-2">
            {" "}
            {inStock ? (
              <Badge variant="outline" className="bg-green-50 text-green-700">
                In Stock ({quantity})
              </Badge>
            ) : (
              <Badge variant="outline" className="bg-red-50 text-red-700">
                Out of Stock
              </Badge>
            )}
          </div>

          <div className="mt-4 text-2xl font-bold text-primary">
            {formatCurrency(price ?? 0)}
          </div>

          <Separator className="my-4" />

          <div className="prose prose-sm max-w-none">
            <p>{description}</p>
          </div>

          <div className="mt-6">
            {/* Client-side Add to Cart component */}
            {inStock ? (
              <AddToCart
                listingId={id}
                listingTitle={title ?? ""}
                listingPrice={price ?? 0}
                listingImage={formattedImages[0]?.url}
                quantity={quantity}
                dimensions={{
                  length: firstComponent?.partDetail?.length ?? null,
                  width: firstComponent?.partDetail?.width ?? null,
                  height: firstComponent?.partDetail?.height ?? null,
                  weight: firstComponent?.partDetail?.weight ?? null,
                }}
                vin={allocatedParts?.[0]?.donor?.vin}
              />
            ) : (
              <div className="rounded-md bg-red-100 px-6 py-4 text-center text-red-700">
                This item is currently out of stock.
              </div>
            )}
          </div>
        </div>
      </div>
      <Separator className="my-8" />
      {components && components.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-lg font-semibold">Parts included</h3>
          <div className="overflow-x-auto rounded-md border">
            <table className="min-w-full divide-y divide-border">
              <thead className="bg-muted">
                <tr>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Name
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Part No
                  </th>
                  <th
                    scope="col"
                    className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground"
                  >
                    Alternate Part Numbers
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-background">
                {components?.map((component) => (
                  <tr key={component.id} className="hover:bg-muted/50">
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {component.partDetail?.name ?? "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-sm">
                      {component.partDetail?.partNo ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {component.partDetail?.alternatePartNumbers ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {uniqueCompatibleCars.length > 0 && (
        <div className="mt-8">
          <InteractiveCompatibleCars cars={uniqueCompatibleCars} />
        </div>
      )}

      <Separator className="my-8" />

      {relatedListings.length > 0 && (
        <div className="mt-8">
          <RelatedListings listings={relatedListings} />
        </div>
      )}
    </div>
  );
}
