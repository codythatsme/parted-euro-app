"use client";

import { useState, useRef, useEffect } from "react";
import { Input } from "~/components/ui/input";
import { api } from "~/trpc/react";
import { ChevronDown, ChevronRight, Loader2, Search } from "lucide-react";

export type SelectedPart = {
  partId: string;
  listingId: string;
  listingTitle: string;
  partNo: string;
  variant: string | null;
  donorVin: string | null;
  price: number;
};

interface ListingSearchProps {
  onSelect: (part: SelectedPart) => void;
  excludePartIds: string[];
}

export function ListingSearch({ onSelect, excludePartIds }: ListingSearchProps) {
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);
  const [expandedListingId, setExpandedListingId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const searchQuery = api.listings.searchByPartNo.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length > 0 },
  );

  const results = (searchQuery.data ?? []).map((listing) => ({
    ...listing,
    availableParts: listing.availableParts.filter(
      (p) => !excludePartIds.includes(p.id),
    ),
  })).filter((listing) => listing.availableParts.length > 0);

  const handleSelectPart = (
    listing: (typeof results)[number],
    part: (typeof results)[number]["availableParts"][number],
  ) => {
    onSelect({
      partId: part.id,
      listingId: listing.id,
      listingTitle: listing.title,
      partNo: listing.partNos.join(", "),
      variant: part.variant,
      donorVin: part.donorVin,
      price: listing.price,
    });
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search by part number or title..."
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => {
            if (query.length > 0) setIsOpen(true);
          }}
          className="pl-9"
        />
      </div>

      {isOpen && debouncedQuery.length > 0 && (
        <div className="absolute z-50 mt-1 max-h-80 w-full overflow-y-auto rounded-md border bg-popover shadow-lg">
          {searchQuery.isLoading && (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          )}

          {!searchQuery.isLoading && results.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">
              No results found
            </div>
          )}

          {results.map((listing) => {
            const isExpanded = expandedListingId === listing.id;
            const partCount = listing.availableParts.length;
            const singlePart = partCount === 1;

            return (
              <div key={listing.id}>
                <button
                  type="button"
                  className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-accent"
                  onClick={() => {
                    if (singlePart) {
                      handleSelectPart(listing, listing.availableParts[0]!);
                    } else {
                      setExpandedListingId(isExpanded ? null : listing.id);
                    }
                  }}
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    {!singlePart && (
                      isExpanded
                        ? <ChevronDown className="h-4 w-4 flex-shrink-0" />
                        : <ChevronRight className="h-4 w-4 flex-shrink-0" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">
                        {listing.title}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {listing.partNos.join(", ")}
                      </div>
                    </div>
                  </div>
                  <div className="ml-4 flex-shrink-0 text-right">
                    <div className="text-sm font-medium">
                      ${listing.price.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {partCount} available
                    </div>
                  </div>
                </button>

                {isExpanded && !singlePart && (
                  <div className="border-t bg-muted/30">
                    {listing.availableParts.map((part) => (
                      <button
                        key={part.id}
                        type="button"
                        className="flex w-full items-center gap-3 px-8 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => handleSelectPart(listing, part)}
                      >
                        <div className="min-w-0 flex-1">
                          <span className="font-medium">
                            {part.variant ?? "Standard"}
                          </span>
                          {part.donorVin && (
                            <span className="ml-2 text-xs text-muted-foreground">
                              VIN: {part.donorVin}
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
