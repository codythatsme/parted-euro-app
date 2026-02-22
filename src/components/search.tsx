"use client";

import { useState, useEffect, useRef } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import { useDebounce } from "use-debounce";
import { Loader2, Search, Tag, Sparkles, ArrowRight } from "lucide-react";
import Link from "next/link";
import Image from "next/image";
import { formatCurrency } from "~/lib/utils";
import { api } from "~/trpc/react";
import { cn } from "~/lib/utils";
import { useRouter } from "next/navigation";

export function SearchCommand({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery] = useDebounce(query, 300);
  const eventListenerRegistered = useRef(false);
  const router = useRouter();

  // Enable the query whenever open is true and we have a search term
  const { data: results, isLoading } = api.listings.globalSearch.useQuery(
    { query: debouncedQuery, limit: 10 },
    {
      enabled: open && debouncedQuery.length > 0,
    },
  );

  useEffect(() => {
    // Prevent duplicate event listeners
    if (eventListenerRegistered.current) return;

    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };

    document.addEventListener("keydown", down);
    eventListenerRegistered.current = true;

    return () => {
      document.removeEventListener("keydown", down);
      eventListenerRegistered.current = false;
    };
  }, []);

  function toggleSearch() {
    setOpen(!open);
  }

  function handleSearch() {
    if (query.trim()) {
      setOpen(false);
      router.push(`/listings?search=${encodeURIComponent(query.trim())}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query.trim()) {
      e.preventDefault();
      handleSearch();
    }
  }

  // Popular search suggestions
  const popularSearches = [
    { label: "BMW E36 Parts", href: "/listings?search=bmw+e36" },
    { label: "Headlights", href: "/listings?search=headlight" },
    { label: "Engine Parts", href: "/listings?search=engine" },
    { label: "Interior", href: "/listings?search=interior" },
  ];

  return (
    <>
      <button
        onClick={toggleSearch}
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-md transition-colors hover:bg-accent",
          className,
        )}
        aria-label="Search listings"
      >
        <Search className="h-5 w-5" />
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <Command className="overflow-hidden rounded-lg border shadow-md">
          <div className="flex items-center border-b px-3">
            <CommandInput
              placeholder="Search listings..."
              value={query}
              onValueChange={setQuery}
              onKeyDown={handleKeyDown}
              autoFocus
              className="h-11 border-none py-3"
            />

            <button
              onClick={handleSearch}
              disabled={!query.trim()}
              className="ml-2 mr-6 flex h-8 items-center gap-1 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
            >
              Search <ArrowRight className="h-3 w-3" />
            </button>
          </div>

          <CommandList className="duration-200 ease-in-out animate-in fade-in-50">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              </div>
            ) : null}

            {!isLoading &&
            debouncedQuery.length > 0 &&
            (!results || results.length === 0) ? (
              <CommandEmpty>
                No results found for &ldquo;{debouncedQuery}&rdquo;
              </CommandEmpty>
            ) : null}

            {/* Empty state with suggestions */}
            {!isLoading && debouncedQuery.length === 0 ? (
              <div className="px-4 py-6 duration-300 animate-in fade-in-50 slide-in-from-bottom-4">
                <div className="space-y-5">
                  <div>
                    <div className="mb-2 flex items-center text-sm text-muted-foreground">
                      <Tag className="mr-1 h-4 w-4" />
                      <span>Popular searches</span>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {popularSearches.map((item) => (
                        <Link
                          key={item.label}
                          href={item.href}
                          onClick={() => setOpen(false)}
                          className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium transition-colors hover:bg-secondary/80"
                        >
                          {item.label}
                        </Link>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-muted-foreground">
                    <div className="mb-1 flex items-center">
                      <Sparkles className="mr-1 h-3 w-3" />
                      <span>Pro tip</span>
                    </div>
                    <p>
                      Press{" "}
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        ⌘
                      </kbd>{" "}
                      +{" "}
                      <kbd className="rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                        K
                      </kbd>{" "}
                      to open search from anywhere
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {results && results.length > 0 ? (
              <CommandGroup
                heading="Listings"
                className="duration-200 animate-in fade-in-50 slide-in-from-bottom-4"
              >
                {results.map((listing) => (
                  <Link
                    href={`/listings/${listing.id}`}
                    key={listing.id}
                    passHref
                  >
                    <CommandItem
                      onSelect={() => {
                        setOpen(false);
                      }}
                      className="flex items-start gap-3 py-3 hover:bg-accent"
                      value={listing.title}
                    >
                      <div className="relative h-16 w-16 overflow-hidden rounded-md border">
                        {listing.images?.[0] ? (
                          <Image
                            src={listing.images[0].url}
                            alt={listing.title}
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center bg-muted">
                            <Search className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col">
                        <span className="font-medium">{listing.title}</span>
                        <span className="text-sm text-primary">
                          {formatCurrency(listing.price)}
                        </span>
                        <p className="line-clamp-1 text-xs text-muted-foreground">
                          {listing.description?.slice(0, 60)}
                          {listing.description &&
                          listing.description.length > 60
                            ? "..."
                            : ""}
                        </p>
                      </div>
                    </CommandItem>
                  </Link>
                ))}
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </CommandDialog>
    </>
  );
}
