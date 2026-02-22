"use client";

import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { parseAsInteger, useQueryState } from "nuqs";
import { useDebounce } from "use-debounce";
import {
  Search,
  Filter,
  X,
  ArrowUpDown,
  Car,
  Loader2,
} from "lucide-react";

// UI Components
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Card, CardContent } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "~/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "~/components/ui/sheet";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "~/components/ui/pagination";
import { SelectCarModal } from "~/components/SelectCarModal";
import { Link } from "~/components/link";

export default function ListingsPage() {
  // URL State Management
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [sortBy, setSortBy] = useQueryState("sortBy", {
    defaultValue: "updatedAt",
  });
  const [sortOrder, setSortOrder] = useQueryState("sortOrder", {
    defaultValue: "desc",
  });
  const [search, setSearch] = useQueryState("search", {
    defaultValue: "",
  });
  const [category, setCategory] = useQueryState("category", {
    defaultValue: "",
  });
  const [subcat, setSubcat] = useQueryState("subcat", {
    defaultValue: "",
  });
  const [generation, setGeneration] = useQueryState("generation", {
    defaultValue: "",
  });
  const [model, setModel] = useQueryState("model", {
    defaultValue: "",
  });
  const [series, setSeries] = useQueryState("series", {
    defaultValue: "",
  });
  const [make, setMake] = useQueryState("make", {
    defaultValue: "",
  });

  // Local state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null,
  );
  const [selectCarModalOpen, setSelectCarModalOpen] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  // Debounce search to reduce API calls
  const [debouncedSearch] = useDebounce(search, 500);

  // Set isSearching when search changes but debouncedSearch hasn't caught up
  useEffect(() => {
    if (search !== debouncedSearch) {
      setIsSearching(true);
    } else {
      setIsSearching(false);
    }
  }, [search, debouncedSearch]);

  // API calls
  const listings = api.listings.searchListings.useQuery({
    page: page - 1, // Convert to 0-indexed for the backend
    sortBy,
    sortOrder: sortOrder as "asc" | "desc",
    search: debouncedSearch,
    category,
    subcat,
    generation,
    model,
    series,
    make,
  });

  const parentCategories = api.category.getParentCategories.useQuery();
  const subcategories = api.category.getSubCategories.useQuery(
    { parentId: selectedCategoryId ?? "" },
    { enabled: !!selectedCategoryId },
  );

  // Update selectedCategoryId when category changes
  useEffect(() => {
    if (category && parentCategories.data) {
      const found = parentCategories.data.find((c) => c.name === category);
      if (found) {
        setSelectedCategoryId(found.id);
      }
    }
  }, [category, parentCategories.data]);

  // Scroll to top on pagination change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  // Handle filter changes
  const handleCategoryChange = (categoryName: string) => {
    // Toggle off if clicking the same category
    if (categoryName === category) {
      void setCategory("");
      void setSubcat("");
      void setPage(1);
      return;
    }
    void setCategory(categoryName);
    void setSubcat("");
    void setPage(1);
  };

  const handleSubcategoryChange = (subcategoryName: string) => {
    // Toggle off if clicking the same subcategory
    if (subcategoryName === subcat) {
      void setSubcat("");
      void setPage(1);
      return;
    }
    void setSubcat(subcategoryName);
    void setPage(1);
  };

  const handleSortChange = (value: string) => {
    const [newSortBy, newSortOrder] = value.split("-");
    void setSortBy(newSortBy!);
    void setSortOrder(newSortOrder as "asc" | "desc");
    void setPage(1);
  };

  const clearFilters = () => {
    void setCategory("");
    void setSubcat("");
    void setGeneration("");
    void setModel("");
    void setSeries("");
    void setMake("");
    void setPage(1);
  };

  const hasActiveFilters = !!(
    category ||
    subcat ||
    generation ||
    model ||
    series ||
    make
  );

  // Handle car selection from modal
  const handleCarSelected = (carData: {
    make: string;
    series?: string;
    generation?: string;
    model?: string;
  }) => {
    // Only set URL parameters for values that are provided
    void setMake(carData.make);
    void setGeneration(carData.generation ?? "");
    void setModel(carData.model ?? "");
    void setSeries(carData.series ?? "");
    void setPage(1);
  };

  // Generate pagination
  const renderPagination = () => {
    if (!listings.data) return null;

    const { totalPages } = listings.data;
    if (totalPages <= 1) return null;

    // Create an array of page numbers to show
    let pages: (number | "ellipsis")[] = [];

    if (totalPages <= 7) {
      // Show all pages if there are 7 or fewer
      pages = Array.from({ length: totalPages }, (_, i) => i + 1);
    } else {
      // Always include first and last page
      pages = [1];

      // Add ellipsis or pages around the current page
      if (page <= 3) {
        pages.push(2, 3, 4, "ellipsis");
      } else if (page >= totalPages - 2) {
        pages.push("ellipsis", totalPages - 3, totalPages - 2, totalPages - 1);
      } else {
        pages.push("ellipsis", page - 1, page, page + 1, "ellipsis");
      }

      pages.push(totalPages);
    }

    return (
      <Pagination className="my-6">
        <PaginationContent>
          <PaginationItem>
            <PaginationPrevious
              onMouseDown={() => void setPage(Math.max(1, page - 1))}
              aria-disabled={page === 1}
              className={page === 1 ? "pointer-events-none opacity-50" : ""}
            />
          </PaginationItem>

          {pages.map((pageNum, i) =>
            pageNum === "ellipsis" ? (
              <PaginationItem key={`ellipsis-${i}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={pageNum}>
                <PaginationLink
                  isActive={page === pageNum}
                  onMouseDown={() => void setPage(pageNum)}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              onMouseDown={() => void setPage(Math.min(totalPages, page + 1))}
              aria-disabled={page === totalPages}
              className={
                page === totalPages ? "pointer-events-none opacity-50" : ""
              }
            />
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    );
  };

  return (
    <main className="container mx-auto px-4 py-6 md:px-6 lg:px-8">
      <div className="mb-6 flex flex-col md:flex-row md:items-center md:justify-between">
        <h1 className="mb-4 text-3xl font-bold md:mb-0">Listings</h1>

        <div className="flex w-full flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0 md:w-auto">
          {/* Select Car Button */}
          <Button
            variant="default"
            className="flex items-center gap-2 whitespace-nowrap"
            onMouseDown={() => setSelectCarModalOpen(true)}
          >
            <Car className="h-4 w-4" />
            <span>Select Car</span>
          </Button>

          {/* Search Input */}
          <div className="relative w-full md:max-w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                void setSearch(e.target.value);
                void setPage(1);
              }}
              placeholder="Search listings..."
              className="pl-10"
            />
            {search && !isSearching && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 transform"
                onMouseDown={() => {
                  void setSearch("");
                  void setPage(1);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
            {isSearching && (
              <div className="absolute right-1 top-1/2 -translate-y-1/2 transform">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>

          {/* Sort Dropdown */}
          <Select
            value={`${sortBy}-${sortOrder}`}
            onValueChange={handleSortChange}
          >
            <SelectTrigger className="w-full sm:w-[180px]">
              <div className="flex items-center">
                <ArrowUpDown className="mr-2 h-4 w-4" />
                <span>Sort By</span>
              </div>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="updatedAt-desc">Newest First</SelectItem>
              <SelectItem value="updatedAt-asc">Oldest First</SelectItem>
              <SelectItem value="price-asc">Price: Low to High</SelectItem>
              <SelectItem value="price-desc">Price: High to Low</SelectItem>
              <SelectItem value="title-asc">Title: A-Z</SelectItem>
              <SelectItem value="title-desc">Title: Z-A</SelectItem>
            </SelectContent>
          </Select>

          {/* Mobile Filter Button */}
          <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
            <SheetTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto md:hidden">
                <Filter className="mr-2 h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <Badge
                    variant="secondary"
                    className="ml-2 h-5 w-5 rounded-full p-0 text-center"
                  >
                    {
                      [
                        category,
                        subcat,
                        generation,
                        model,
                        series,
                        make,
                      ].filter(Boolean).length
                    }
                  </Badge>
                )}
              </Button>
            </SheetTrigger>

            <SheetContent
              side="left"
              className="w-[300px] sm:w-[350px] md:max-w-sm"
            >
              <SheetHeader>
                <SheetTitle>Filters</SheetTitle>
              </SheetHeader>
              <div className="mt-4 flex flex-col space-y-4">
                {/* Mobile Select Car Button */}
                <Button
                  variant="default"
                  className="flex items-center gap-2"
                  onMouseDown={() => {
                    setSelectCarModalOpen(true);
                    setSidebarOpen(false);
                  }}
                >
                  <Car className="h-4 w-4" />
                  <span>Select Car</span>
                </Button>
                {renderFilterContent()}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {/* Select Car Modal */}
      <SelectCarModal
        open={selectCarModalOpen}
        onOpenChange={setSelectCarModalOpen}
        onCarSelected={handleCarSelected}
      />

      {/* Desktop Layout */}
      <div className="flex flex-col space-y-6 lg:flex-row lg:space-x-6 lg:space-y-0">
        {/* Sidebar (desktop only) */}
        <div className="hidden w-full md:block md:w-[250px] lg:w-[280px]">
          <div className="sticky top-6 rounded-lg border bg-card text-card-foreground shadow-sm">
            <div className="p-4">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="font-semibold">Filters</h2>
                {hasActiveFilters && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onMouseDown={clearFilters}
                    className="h-auto p-0 text-xs text-muted-foreground"
                  >
                    Clear all
                  </Button>
                )}
              </div>
              {renderFilterContent()}
            </div>
          </div>
        </div>

        {/* Listings Grid */}
        <div className="flex-1">
          {/* Active Filters (Mobile) */}
          {hasActiveFilters && (
            <div className="mb-4 flex flex-wrap gap-2 md:hidden">
              {category && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {category}
                  <Button
                    variant="ghost"
                    size="icon"
                    onMouseDown={() => void setCategory("")}
                    className="h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              {subcat && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  {subcat}
                  <Button
                    variant="ghost"
                    size="icon"
                    onMouseDown={() => void setSubcat("")}
                    className="h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              {(make || generation || model || series) && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  <Car className="mr-1 h-3 w-3" />
                  {[make, series, generation, model]
                    .filter(Boolean)
                    .join(" - ")}
                  <Button
                    variant="ghost"
                    size="icon"
                    onMouseDown={() => {
                      void setMake("");
                      void setGeneration("");
                      void setModel("");
                      void setSeries("");
                    }}
                    className="h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onMouseDown={clearFilters}
                className="h-auto text-xs text-muted-foreground"
              >
                Clear all
              </Button>
            </div>
          )}

          {/* Results Stats */}
          {listings.data && (
            <p className="mb-4 text-sm text-muted-foreground">
              Showing {listings.data.listings.length} of {listings.data.count}{" "}
              results
            </p>
          )}

          {/* Loading State */}
          {(listings.isLoading || isSearching) && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <div className="h-40 bg-muted"></div>
                  <CardContent className="p-4">
                    <div className="mb-2 h-4 w-2/3 bg-muted"></div>
                    <div className="mb-4 h-4 w-1/2 bg-muted"></div>
                    <div className="h-6 w-1/3 bg-muted"></div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          {/* Error State */}
          {listings.isError && !isSearching && (
            <div className="my-10 text-center">
              <p className="text-lg font-medium text-destructive">
                Failed to load listings
              </p>
              <p className="text-muted-foreground">Please try again later</p>
            </div>
          )}

          {/* No Results */}
          {listings.data?.listings.length === 0 && (
            <div className="my-10 text-center">
              <p className="text-lg font-medium">No listings found</p>
              <p className="text-muted-foreground">
                Try adjusting your filters or search term
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onMouseDown={clearFilters}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          )}

          {/* Listings Grid */}
          {listings.data && listings.data.listings.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {listings.data.listings.map((listing) => {
                const totalQuantity = listing.stock ?? 0;
                const inStock = totalQuantity > 0;

                return (
                  <Link
                    prefetch={true}
                    key={listing.id}
                    href={`/listings/${listing.id}`}
                  >
                    <Card className="group cursor-pointer overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-md">
                      <div className="relative h-[200px] w-full bg-muted">
                        {!inStock && (
                          <Badge
                            variant="outline"
                            className="absolute left-2 top-2 z-10 bg-red-50 text-red-700"
                          >
                            Out of Stock
                          </Badge>
                        )}
                        {listing.images?.[0] ? (
                          <img
                            src={listing.images[0].url}
                            alt={listing.title}
                            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted">
                            <span className="text-muted-foreground">
                              No image
                            </span>
                          </div>
                        )}
                      </div>
                      <CardContent className="p-4">
                        <h3 className="mb-2 line-clamp-1 text-lg font-medium">
                          {listing.title}
                        </h3>
                        <p className="mb-2 line-clamp-2 text-sm text-muted-foreground">
                          {listing.description || "No description available"}
                        </p>
                        <div className="flex items-center justify-between">
                          <p className="text-lg font-bold">
                            ${listing.price.toFixed(2)}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            className="relative z-10"
                          >
                            View
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </Link>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {renderPagination()}
        </div>
      </div>
    </main>
  );

  // Helper function to render filter content (used in both mobile and desktop)
  function renderFilterContent() {
    return (
      <>
        {/* Category Filter with nested subcategories */}
        <div className="space-y-2">
          <h3 className="font-medium">Categories</h3>
          <div className="space-y-1">
            {parentCategories.isLoading && (
              <p className="text-sm text-muted-foreground">Loading...</p>
            )}
            {parentCategories.data?.map((cat) => (
              <div key={cat.id} className="flex flex-col">
                <Button
                  variant={category === cat.name ? "default" : "ghost"}
                  size="sm"
                  className="w-full justify-start text-left"
                  onMouseDown={() => handleCategoryChange(cat.name)}
                >
                  {cat.name}
                </Button>

                {/* Show subcategories indented under selected parent */}
                {category === cat.name && selectedCategoryId && (
                  <div className="ml-4 mt-1 space-y-1">
                    {subcategories.isLoading && (
                      <p className="text-xs text-muted-foreground">
                        Loading...
                      </p>
                    )}
                    {subcategories.data?.map((subcategory) => (
                      <Button
                        key={subcategory.id}
                        variant={
                          subcategory.name === subcat ? "default" : "ghost"
                        }
                        size="sm"
                        className="w-full justify-start text-left text-sm"
                        onMouseDown={() =>
                          handleSubcategoryChange(subcategory.name)
                        }
                      >
                        {subcategory.name}
                      </Button>
                    ))}
                    {subcategories.data?.length === 0 && (
                      <p className="text-xs text-muted-foreground">
                        No subcategories available
                      </p>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Car Details */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Car Details</h3>
          </div>

          {make || generation || model || series ? (
            <div className="rounded-md border p-3">
              {make && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Make:</span>
                  <span className="text-sm font-medium">{make}</span>
                </div>
              )}
              {series && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Series:</span>
                  <span className="text-sm font-medium">{series}</span>
                </div>
              )}
              {generation && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">
                    Generation:
                  </span>
                  <span className="text-sm font-medium">{generation}</span>
                </div>
              )}
              {model && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Model:</span>
                  <span className="text-sm font-medium">{model}</span>
                </div>
              )}

              <Button
                variant="ghost"
                size="sm"
                className="mt-2 w-full text-destructive"
                onMouseDown={() => {
                  void setMake("");
                  void setGeneration("");
                  void setModel("");
                  void setSeries("");
                }}
              >
                <X className="mr-1 h-3 w-3" />
                Clear Car Selection
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-md border border-dashed p-6">
              <Car className="mb-2 h-6 w-6 text-muted-foreground" />
              <p className="text-center text-sm text-muted-foreground">
                No car selected
              </p>
              <Button
                variant="outline"
                size="sm"
                className="mt-2"
                onMouseDown={() => setSelectCarModalOpen(true)}
              >
                Select Car
              </Button>
            </div>
          )}
        </div>

        {/* Apply Filters Button (Mobile only) */}
        <Button
          className="mt-2 w-full md:hidden"
          onMouseDown={() => setSidebarOpen(false)}
        >
          Apply Filters
        </Button>
      </>
    );
  }
}
