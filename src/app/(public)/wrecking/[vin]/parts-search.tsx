"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Search, Link as LinkIcon, Loader2 } from "lucide-react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Separator } from "~/components/ui/separator";
import Link from "next/link";

type DonorPartsSearchProps = {
  vin: string;
};

type PartListing = {
  id: string;
  title: string;
  price: number;
  description: string;
  imageUrl: string | null;
  partCategoryId: string;
  partSubcategoryId: string;
  partCategory: {
    name: string;
  };
  partSubcategory: {
    name: string;
  };
};

export function DonorPartsSearch({ vin }: DonorPartsSearchProps) {
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [filteredListings, setFilteredListings] = useState<PartListing[]>([]);

  // Fetch parts categories
  const categories = api.partCategory.getAllCategories.useQuery();

  // Fetch donor parts
  const donorParts = api.donor.getDonorParts.useQuery({ vin });

  // Filter and sort listings whenever search or active category changes
  useEffect(() => {
    if (!donorParts.data) return;

    let filtered = [...donorParts.data];

    // Filter by search term
    if (search) {
      const searchLower = search.toLowerCase();
      filtered = filtered.filter(
        (listing) =>
          listing.title.toLowerCase().includes(searchLower) ||
          listing.description.toLowerCase().includes(searchLower) ||
          listing.partCategory.name.toLowerCase().includes(searchLower) ||
          listing.partSubcategory.name.toLowerCase().includes(searchLower),
      );
    }

    // Filter by category
    if (activeCategory !== "all") {
      filtered = filtered.filter(
        (listing) => listing.partCategoryId === activeCategory,
      );
    }

    // Sort by category and subcategory
    filtered.sort((a, b) => {
      // First by category name
      const categoryCompare = a.partCategory.name.localeCompare(
        b.partCategory.name,
      );
      if (categoryCompare !== 0) return categoryCompare;

      // Then by subcategory name
      return a.partSubcategory.name.localeCompare(b.partSubcategory.name);
    });

    setFilteredListings(filtered);
  }, [search, activeCategory, donorParts.data]);

  // Group listings by category and subcategory
  const groupedListings = filteredListings.reduce(
    (acc, listing) => {
      const categoryId = listing.partCategoryId;
      const subcategoryId = listing.partSubcategoryId;

      if (!acc[categoryId]) {
        acc[categoryId] = {
          id: categoryId,
          name: listing.partCategory.name,
          subcategories: {},
        };
      }

      if (!acc[categoryId].subcategories[subcategoryId]) {
        acc[categoryId].subcategories[subcategoryId] = {
          id: subcategoryId,
          name: listing.partSubcategory.name,
          listings: [],
        };
      }

      acc[categoryId].subcategories[subcategoryId].listings.push(listing);

      return acc;
    },
    {} as Record<
      string,
      {
        id: string;
        name: string;
        subcategories: Record<
          string,
          {
            id: string;
            name: string;
            listings: PartListing[];
          }
        >;
      }
    >,
  );

  // Convert the grouped object to an array for rendering
  const groupedArray = Object.values(groupedListings).sort((a, b) =>
    a.name.localeCompare(b.name),
  );

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-bold">Available Parts</h2>

        {/* Search Input */}
        <div className="relative w-full sm:w-[300px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search parts..."
            className="pl-10"
          />
        </div>
      </div>

      {/* Category Tabs */}
      <Tabs
        defaultValue="all"
        value={activeCategory}
        onValueChange={setActiveCategory}
        className="space-y-4"
      >
        <div className="overflow-x-auto">
          <TabsList className="inline-flex h-auto w-auto space-x-1 rounded-md p-1">
            <TabsTrigger
              value="all"
              className="rounded px-3 py-1.5 text-sm font-medium"
            >
              All Categories
            </TabsTrigger>

            {categories.data?.map((category) => (
              <TabsTrigger
                key={category.id}
                value={category.id}
                className="rounded px-3 py-1.5 text-sm font-medium"
              >
                {category.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {/* Loading state */}
        {(donorParts.isLoading || categories.isLoading) && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="mr-2 h-6 w-6 animate-spin" />
            <span>Loading parts...</span>
          </div>
        )}

        {/* Error state */}
        {(donorParts.isError || categories.isError) && (
          <div className="rounded-md bg-destructive/10 p-4 text-center text-destructive">
            <p>Failed to load parts. Please try again later.</p>
          </div>
        )}

        {/* No results */}
        {donorParts.data?.length === 0 && (
          <div className="text-center">
            <p className="text-lg font-medium">
              No parts available for this vehicle
            </p>
          </div>
        )}

        {/* Results - shown for all tabs */}
        <TabsContent value={activeCategory} className="mt-6">
          {filteredListings.length === 0 && search && (
            <div className="text-center">
              <p className="text-lg font-medium">No parts match your search</p>
              <Button
                variant="link"
                onClick={() => setSearch("")}
                className="mt-2"
              >
                Clear search
              </Button>
            </div>
          )}

          {groupedArray.map((category) => (
            <div key={category.id} className="mb-8">
              <h3 className="mb-4 text-xl font-semibold">{category.name}</h3>

              {Object.values(category.subcategories).map((subcategory) => (
                <div key={subcategory.id} className="mb-6">
                  <div className="mb-2 flex items-center">
                    <h4 className="text-lg font-medium">{subcategory.name}</h4>
                    <Separator className="ml-4 flex-1" />
                  </div>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                    {subcategory.listings.map((listing) => (
                      <Link
                        key={listing.id}
                        href={`/listings/${listing.id}`}
                        className="block"
                      >
                        <Card className="h-full cursor-pointer transition-all hover:shadow-md">
                          <div className="relative h-[180px] w-full overflow-hidden bg-muted">
                            {listing.imageUrl ? (
                              <img
                                src={listing.imageUrl}
                                alt={listing.title}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center bg-muted">
                                <LinkIcon className="h-8 w-8 text-muted-foreground" />
                              </div>
                            )}
                          </div>
                          <CardContent className="p-4">
                            <h5 className="line-clamp-2 text-base font-medium">
                              {listing.title}
                            </h5>
                            <div className="mt-2 flex items-center justify-between">
                              <Badge variant="secondary">
                                ${listing.price.toFixed(2)}
                              </Badge>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-auto py-1"
                              >
                                View
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
