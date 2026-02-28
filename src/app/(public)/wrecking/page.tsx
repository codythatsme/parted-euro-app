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
  Calendar,
  Gauge,
} from "lucide-react";
import Link from "next/link";

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
  SelectValue,
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

// Type definitions
type DonorImage = {
  id: string;
  url: string;
  order: number;
};

type DonorCar = {
  id: string;
  make: string;
  series: string;
  generation: string;
  model: string;
  body?: string | null;
};

type DonorPart = {
  id: string;
};

type Donor = {
  vin: string;
  cost: number;
  carId: string;
  year: number;
  mileage: number;
  createdAt: Date;
  updatedAt: Date;
  hideFromSearch: boolean;
  dateInStock: Date | null;
  images: DonorImage[];
  car: DonorCar;
  parts: DonorPart[];
};

export default function WreckingPage() {
  // URL State Management
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [sortBy, setSortBy] = useQueryState("sortBy", {
    defaultValue: "dateInStock",
  });
  const [sortOrder, setSortOrder] = useQueryState("sortOrder", {
    defaultValue: "desc",
  });
  const [search, setSearch] = useQueryState("search", {
    defaultValue: "",
  });
  const [year, setYear] = useQueryState("year", {
    defaultValue: "all",
  });
  const [make, setMake] = useQueryState("make", {
    defaultValue: "BMW",
  });
  const [series, setSeries] = useQueryState("series", {
    defaultValue: "all",
  });
  const [model, setModel] = useQueryState("model", {
    defaultValue: "all",
  });

  // Local state
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Debounce search to reduce API calls
  const [debouncedSearch] = useDebounce(search, 500);

  // Fetch filter options
  const filterOptions = api.donor.getFilterOptions.useQuery();

  // API calls
  const donors = api.donor.searchDonors.useQuery({
    page: page - 1, // Convert to 0-indexed for the backend
    sortBy: sortBy || "dateInStock",
    sortOrder: (sortOrder as "asc" | "desc") || "desc",
    search: debouncedSearch,
    year: year && year !== "all" ? parseInt(year) : undefined,
    make: make && make !== "all" ? make : undefined,
    series: series && series !== "all" ? series : undefined,
    model: model && model !== "all" ? model : undefined,
  });

  // Scroll to top on pagination change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [page]);

  // Handle filter changes
  const handleSortChange = (value: string) => {
    const [newSortBy, newSortOrder] = value.split("-");
    void setSortBy(newSortBy!);
    void setSortOrder(newSortOrder as "asc" | "desc");
    void setPage(1);
  };

  const clearFilters = () => {
    void setYear("all");
    void setMake("all");
    void setSeries("all");
    void setModel("all");
    void setPage(1);
  };

  const hasActiveFilters = !!(
    year !== "all" ||
    make !== "all" ||
    series !== "all" ||
    model !== "all"
  );

  // Handle make change
  const handleMakeChange = (value: string) => {
    void setMake(value);
    void setSeries("all");
    void setModel("all");
    void setPage(1);
  };

  // Format date for display
  const formatDate = (dateString: string | Date | null) => {
    if (!dateString) return "N/A";
    const date = new Date(dateString);
    return date.toLocaleDateString();
  };

  // Generate pagination
  const renderPagination = () => {
    if (!donors.data) return null;

    const { totalPages } = donors.data;
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
              onClick={() => void setPage(Math.max(1, page - 1))}
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
                  onClick={() => void setPage(pageNum)}
                >
                  {pageNum}
                </PaginationLink>
              </PaginationItem>
            ),
          )}

          <PaginationItem>
            <PaginationNext
              onClick={() => void setPage(Math.min(totalPages, page + 1))}
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
        <h1 className="mb-4 text-3xl font-bold md:mb-0">Donor Vehicles</h1>

        <div className="flex w-full flex-col space-y-2 sm:flex-row sm:space-x-2 sm:space-y-0 md:w-auto">
          {/* Search Input */}
          <div className="relative w-full md:max-w-[300px]">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 transform text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => {
                void setSearch(e.target.value);
                void setPage(1);
              }}
              placeholder="Search..."
              className="pl-10"
            />
            {search && (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 h-7 w-7 -translate-y-1/2 transform"
                onClick={() => {
                  void setSearch("");
                  void setPage(1);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
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
              <SelectItem value="dateInStock-desc">Newest Arrivals</SelectItem>
              <SelectItem value="dateInStock-asc">Oldest Arrivals</SelectItem>
              <SelectItem value="year-desc">Year: Newest First</SelectItem>
              <SelectItem value="year-asc">Year: Oldest First</SelectItem>
              <SelectItem value="mileage-asc">Mileage: Low to High</SelectItem>
              <SelectItem value="mileage-desc">Mileage: High to Low</SelectItem>
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
                        year !== "all" ? year : null,
                        make,
                        series,
                        model,
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
                {renderFilterContentMobile()}
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>

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
                    onClick={clearFilters}
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

        {/* Donors Grid */}
        <div className="flex-1">
          {/* Active Filters (Mobile) */}
          {hasActiveFilters && (
            <div className="mb-4 flex flex-wrap gap-2 md:hidden">
              {year !== "all" && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Year: {year}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void setYear("all")}
                    className="h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              {make && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Make: {make}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      void setMake("all");
                      void setSeries("all");
                      void setModel("all");
                    }}
                    className="h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              {series && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Series: {series}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      void setSeries("all");
                      void setModel("all");
                    }}
                    className="h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              {model && (
                <Badge variant="secondary" className="flex items-center gap-1">
                  Model: {model}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void setModel("all")}
                    className="h-4 w-4 p-0"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-auto text-xs text-muted-foreground"
              >
                Clear all
              </Button>
            </div>
          )}

          {/* Results Stats */}
          {donors.data && (
            <p className="mb-4 text-sm text-muted-foreground">
              Showing {donors.data.donors.length} of {donors.data.count} donors
            </p>
          )}

          {/* Loading State */}
          {(donors.isLoading || filterOptions.isLoading) && (
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
          {(donors.isError || filterOptions.isError) && (
            <div className="my-10 text-center">
              <p className="text-lg font-medium text-destructive">
                Failed to load donors
              </p>
              <p className="text-muted-foreground">Please try again later</p>
            </div>
          )}

          {/* No Results */}
          {donors.data?.donors.length === 0 && (
            <div className="my-10 text-center">
              <p className="text-lg font-medium">No donor vehicles found</p>
              <p className="text-muted-foreground">
                Try adjusting your filters or search term
              </p>
              {hasActiveFilters && (
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={clearFilters}
                >
                  Clear all filters
                </Button>
              )}
            </div>
          )}

          {/* Donors Grid */}
          {donors.data && donors.data.donors.length > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {donors.data.donors.map((donor: Donor) => (
                <Link
                  prefetch={true}
                  key={donor.vin}
                  href={`/wrecking/${donor.vin}`}
                  className="block"
                >
                  <Card className="group cursor-pointer overflow-hidden transition-all duration-200 hover:scale-[1.02] hover:shadow-md">
                    <div className="relative h-[200px] w-full bg-muted">
                      {donor.images?.[0] ? (
                        <img
                          src={donor.images[0].url}
                          alt={`${donor.car.make} ${donor.car.model}`}
                          className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-muted">
                          <Car className="h-12 w-12 text-muted-foreground" />
                        </div>
                      )}
                    </div>
                    <CardContent className="p-4">
                      <div className="mb-2 flex items-center justify-between">
                        <h3 className="line-clamp-1 text-lg font-medium">
                          {donor.car.make} {donor.car.series} {donor.car.model}
                        </h3>
                        <Badge>{donor.year}</Badge>
                      </div>

                      <div className="mb-4 space-y-1">
                        <div className="flex items-center text-sm text-muted-foreground">
                          <span className="font-medium">VIN:</span>
                          <span className="ml-2">{donor.vin}</span>
                        </div>

                        <div className="flex items-center text-sm text-muted-foreground">
                          <Gauge className="mr-1 h-3 w-3" />
                          <span className="font-medium">Mileage:</span>
                          <span className="ml-2">
                            {donor.mileage.toLocaleString()} km
                          </span>
                        </div>

                        <div className="flex items-center text-sm text-muted-foreground">
                          <Calendar className="mr-1 h-3 w-3" />
                          <span className="font-medium">Date In Stock:</span>
                          <span className="ml-2">
                            {formatDate(donor.dateInStock)}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <Badge variant="outline">
                          {donor.parts.length} parts available
                        </Badge>
                        <Button
                          variant="outline"
                          size="sm"
                          className="relative z-10"
                        >
                          View Parts
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}

          {/* Pagination */}
          {renderPagination()}
        </div>
      </div>
    </main>
  );

  // Helper function to render filter content (used for desktop)
  function renderFilterContent() {
    return (
      <>
        {/* Year Filter */}
        <div className="mb-4 space-y-2">
          <h3 className="font-medium">Year</h3>
          <Select
            value={year}
            onValueChange={(value) => {
              void setYear(value);
              void setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Year</SelectItem>
              {filterOptions.data?.years?.map((yearOption) => (
                <SelectItem key={yearOption} value={yearOption.toString()}>
                  {yearOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Make Filter */}
        <div className="mb-4 space-y-2">
          <h3 className="font-medium">Make</h3>
          <Select value={make} onValueChange={handleMakeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select make" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Make</SelectItem>
              {filterOptions.data?.makes?.map((makeOption) => (
                <SelectItem key={makeOption} value={makeOption}>
                  {makeOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Series Filter - only shown when make is selected */}
        {make &&
          make !== "all" &&
          !!filterOptions.data?.seriesByMake?.[make]?.length && (
            <div className="mb-4 space-y-2">
              <h3 className="font-medium">Series</h3>
              <Select
                value={series}
                onValueChange={(value) => {
                  void setSeries(value);
                  void setModel("all");
                  void setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Series</SelectItem>
                  {filterOptions.data?.seriesByMake?.[make]?.map(
                    (seriesOption) => (
                      <SelectItem key={seriesOption} value={seriesOption}>
                        {seriesOption}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

        {/* Model Filter - only shown when make is selected */}
        {make &&
          make !== "all" &&
          !!filterOptions.data?.modelsByMake?.[make]?.length && (
            <div className="mb-4 space-y-2">
              <h3 className="font-medium">Model</h3>
              <Select
                value={model}
                onValueChange={(value) => {
                  void setModel(value);
                  void setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Model</SelectItem>
                  {filterOptions.data?.modelsByMake?.[make]?.map(
                    (modelOption) => (
                      <SelectItem key={modelOption} value={modelOption}>
                        {modelOption}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}
      </>
    );
  }

  // Helper function to render filter content for mobile
  function renderFilterContentMobile() {
    return (
      <>
        {/* Year Filter */}
        <div className="space-y-2">
          <h3 className="font-medium">Year</h3>
          <Select
            value={year}
            onValueChange={(value) => {
              void setYear(value);
              void setPage(1);
            }}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select year" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Year</SelectItem>
              {filterOptions.data?.years?.map((yearOption) => (
                <SelectItem key={yearOption} value={yearOption.toString()}>
                  {yearOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Make Filter */}
        <div className="space-y-2">
          <h3 className="font-medium">Make</h3>
          <Select value={make} onValueChange={handleMakeChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select make" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Make</SelectItem>
              {filterOptions.data?.makes?.map((makeOption) => (
                <SelectItem key={makeOption} value={makeOption}>
                  {makeOption}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Series Filter - only shown when make is selected */}
        {make &&
          make !== "all" &&
          !!filterOptions.data?.seriesByMake?.[make]?.length && (
            <div className="space-y-2">
              <h3 className="font-medium">Series</h3>
              <Select
                value={series}
                onValueChange={(value) => {
                  void setSeries(value);
                  void setModel("all");
                  void setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select series" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Series</SelectItem>
                  {filterOptions.data?.seriesByMake?.[make]?.map(
                    (seriesOption) => (
                      <SelectItem key={seriesOption} value={seriesOption}>
                        {seriesOption}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

        {/* Model Filter - only shown when make is selected */}
        {make &&
          make !== "all" &&
          !!filterOptions.data?.modelsByMake?.[make]?.length && (
            <div className="space-y-2">
              <h3 className="font-medium">Model</h3>
              <Select
                value={model}
                onValueChange={(value) => {
                  void setModel(value);
                  void setPage(1);
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Model</SelectItem>
                  {filterOptions.data?.modelsByMake?.[make]?.map(
                    (modelOption) => (
                      <SelectItem key={modelOption} value={modelOption}>
                        {modelOption}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
          )}

        {/* Apply Filters Button (Mobile only) */}
        <Button className="mt-2 w-full" onClick={() => setSidebarOpen(false)}>
          Apply Filters
        </Button>
      </>
    );
  }
}
