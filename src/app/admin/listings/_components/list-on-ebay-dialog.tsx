"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  ChevronLeft,
  Search,
  Check,
  ChevronsUpDown,
} from "lucide-react";
import { type AdminListingsItem } from "~/trpc/shared";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { api } from "~/trpc/react";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { cn } from "~/lib/utils";

interface ListOnEbayDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  listing: AdminListingsItem;
}

type FulfillmentPolicyType = {
  name: string;
  marketplaceId: string;
  categoryTypes: {
    name: string;
    default: boolean;
  }[];
  handlingTime: {
    value: number;
    unit: string;
  };
  shipToLocations: {
    regionIncluded: {
      regionName: string;
    }[];
  };
  shippingOptions: {
    optionType: string;
    costType: string;
    shippingServiceCode: string;
    shippingCost: {
      value: string;
      currency: string;
    };
    additionalShippingCost: {
      value: string;
      currency: string;
    };
    shippingCarrierCode: string;
    sortOrder: number;
  }[];
  globalShipping: boolean;
  pickupDropOff: boolean;
  localPickup: boolean;
  freightShipping: boolean;
  fulfillmentPolicyId: string;
};

type CategoryOption = {
  value: string;
  label: string;
};

export function ListOnEbayDialog({
  open,
  onOpenChange,
  listing,
}: ListOnEbayDialogProps) {
  // Form state
  const [title, setTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [condition, setCondition] = useState<string>("");
  const [price, setPrice] = useState<number>(0);
  const [ebayCondition, setEbayCondition] = useState("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [categorySearchTerm, setCategorySearchTerm] = useState<string>("");
  const [categoryPopoverOpen, setCategoryPopoverOpen] = useState(false);
  const [categoryInputValue, setCategoryInputValue] = useState("");
  const [domesticShipping, setDomesticShipping] = useState<number>(0);
  const [internationalShipping, setInternationalShipping] = useState<number>(0);
  const [createNewFulfillmentPolicy, setCreateNewFulfillmentPolicy] =
    useState<boolean>(false);
  const [fulfillmentPolicy, setFulfillmentPolicy] =
    useState<FulfillmentPolicyType | null>(null);
  const [quantity, setQuantity] = useState<number>(0);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validated, setValidated] = useState<boolean>(false);
  const utils = api.useUtils();

  // Reset form function
  const resetForm = () => {
    const defaultTitle = `${listing.title} ${listing.components[0]?.partDetail.partNo ?? ""}`;
    setTitle(defaultTitle);
    setDescription(listing.description);
    setCondition(listing.condition);
    setPrice(Math.ceil(listing.price * 0.15 + listing.price));
    setEbayCondition("");
    setCategoryId("");
    setCategorySearchTerm(defaultTitle);
    setCategoryPopoverOpen(false);
    setCategoryInputValue("");
    setDomesticShipping(0);
    setInternationalShipping(0);
    setCreateNewFulfillmentPolicy(false);
    setFulfillmentPolicy(null);
    setQuantity(listing.stock ?? 0);
    setValidated(false);
  };

  // Reset form when dialog opens or listing changes
  useEffect(() => {
    if (open && listing) {
      resetForm();
    }
  }, [open, listing.id]);

  // API calls
  const createEbayListing = api.ebay.createListing.useMutation({
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const listingCars = api.listings.getListingCars.useQuery(
    { id: listing.id },
    { enabled: open },
  );
  const fulfillmentPolicies = api.ebay.getFulfillmentPolicies.useQuery(undefined, {
    enabled: open,
  });
  const categoryIds = api.ebay.getCategoryIds.useQuery(
    {
      title: categorySearchTerm,
    },
    {
      enabled: categorySearchTerm.length > 0,
    },
  );

  // Get selected category label
  const selectedCategoryLabel =
    (categoryIds.data as CategoryOption[] | undefined)?.find(
      (category) => category.value === categoryId,
    )?.label ?? "";

  // Handle category search
  const handleCategorySearch = (value: string) => {
    setCategoryInputValue(value);
    // Only update the search term after a short delay
    if (value.trim().length > 2) {
      const timeoutId = setTimeout(() => {
        setCategorySearchTerm(value);
      }, 300);
      return () => clearTimeout(timeoutId);
    }
  };

  // Handle category selection
  const handleCategorySelect = (value: string) => {
    const category = (categoryIds.data as CategoryOption[] | undefined)?.find(
      (c) => c.value === value,
    );
    if (category) {
      setCategoryId(value);
      setCategoryPopoverOpen(false);
    }
  };

  // Custom search button click
  const handleCustomSearch = () => {
    if (categoryInputValue.trim()) {
      setCategorySearchTerm(categoryInputValue);
    }
  };

  // Calculate quantity from component-backed stock.
  useEffect(() => {
    setQuantity(listing.stock ?? 0);
  }, [listing]);

  // Form validation
  useEffect(() => {
    if (
      title &&
      description &&
      condition &&
      price &&
      ebayCondition &&
      categoryId
    ) {
      setValidated(true);
    } else {
      setValidated(false);
    }
  }, [title, description, condition, price, ebayCondition, categoryId]);

  // eBay condition options
  const ebayConditions = [
    { label: "New", value: "NEW" },
    { label: "Used", value: "USED_EXCELLENT" },
    { label: "For Parts Or Not Working", value: "FOR_PARTS_OR_NOT_WORKING" },
  ];

  // Create HTML table for part fitment
  const makeTableHTML = () => {
    return (listingCars.data ?? [])
      .map((car) => {
        return `<tr style="padding:1rem; border-bottom: 1px solid #ddd">
          <td>${car.series}</td>
          <td>${car.generation}</td>
          <td>${car.model}</td>
        </tr>`;
      })
      .join("");
  };

  // Handle form submission
  const handleListOnEbay = async () => {
    if (!validated) return;

    setIsSubmitting(true);

    try {
      await createEbayListing.mutateAsync({
        listingId: listing.id,
        title: title,
        price: price,
        description: description,
        images: listing.images.map((image) => image.url),
        condition: condition,
        conditionDescription: ebayCondition,
        quantity: quantity,
        partNo: listing.components[0]?.partDetail.partNo ?? "",
        categoryId: categoryId,
        domesticShipping: domesticShipping,
        internationalShipping: internationalShipping,
        fulfillmentPolicyId: fulfillmentPolicy?.fulfillmentPolicyId,
        partsTable: `<table style="padding:1rem; text-align:center; max-width:40rem;">
          <thead>
            <tr style="border-bottom: 1px solid #ddd">
              <th style="padding:1rem;">Series</th>
              <th>Generation</th>
              <th>Model</th>
            </tr>
          </thead>
          <tbody>${makeTableHTML()}</tbody>
        </table>`,
      });

      toast.success(`Listing "${listing.title}" has been listed on eBay`);

      // Update the specific listing in the cache instead of invalidating the entire query
      utils.listings.getAllAdmin.setData(undefined, (oldData) => {
        if (!oldData) return oldData;
        return {
          ...oldData,
          items: oldData.items.map((item) =>
            item.id === listing.id ? { ...item, listedOnEbay: true } : item,
          ),
        };
      });

      resetForm();
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to create eBay listing",
      );
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1200px]">
        <DialogHeader>
          <DialogTitle>List on eBay</DialogTitle>
          <DialogDescription>
            Configure your eBay listing details below
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="relative">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              className="mt-1 pr-4"
              value={title}
              placeholder="Title"
              onChange={(e) => setTitle(e.target.value)}
            />
            <span
              className={`absolute bottom-1 right-2 text-xs ${
                title.length > 80 ? "text-destructive" : "text-muted-foreground"
              }`}
            >
              {title.length}/80
            </span>
          </div>

          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              className="mt-1"
              value={description}
              rows={4}
              placeholder="Description"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="ebayCondition">eBay Condition</Label>
            <Select value={ebayCondition} onValueChange={setEbayCondition}>
              <SelectTrigger className="mt-1">
                <SelectValue placeholder="Select eBay condition" />
              </SelectTrigger>
              <SelectContent>
                {ebayConditions.map((condition) => (
                  <SelectItem key={condition.value} value={condition.value}>
                    {condition.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="categoryId">eBay Category</Label>
            <div className="mt-1">
              <Popover
                open={categoryPopoverOpen}
                onOpenChange={setCategoryPopoverOpen}
                modal={true}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={categoryPopoverOpen}
                    className="w-full justify-between"
                  >
                    {selectedCategoryLabel || "Select or search for a category"}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
                  <Command shouldFilter={false}>
                    <div className="flex items-center border-b px-3">
                      <CommandInput
                        placeholder="Search for a category..."
                        value={categoryInputValue}
                        onValueChange={handleCategorySearch}
                        className="flex-1"
                      />
                    </div>
                    <CommandList className="max-h-[250px] overflow-auto">
                      <CommandEmpty>
                        {categoryIds.isLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                          </div>
                        ) : (
                          <div className="py-6 text-center text-sm">
                            No categories found. Try a different search term.
                          </div>
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {(
                          categoryIds.data as CategoryOption[] | undefined
                        )?.map((category) => (
                          <CommandItem
                            key={category.value}
                            value={category.value}
                            onSelect={handleCategorySelect}
                          >
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4",
                                categoryId === category.value
                                  ? "opacity-100"
                                  : "opacity-0",
                              )}
                            />
                            {category.label}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>

              <div className="mt-2">
                <div className="text-xs text-muted-foreground">
                  {(categoryIds.data as CategoryOption[] | undefined)?.length
                    ? `${(categoryIds.data as CategoryOption[] | undefined)?.length} categories found`
                    : "Enter a more specific search term to find categories"}
                </div>
                {!(categoryIds.data as CategoryOption[] | undefined)?.length &&
                  categorySearchTerm &&
                  !categoryIds.isLoading && (
                    <div className="mt-2">
                      <Input
                        placeholder="Enter a custom search term for categories"
                        value={categoryInputValue}
                        onChange={(e) => setCategoryInputValue(e.target.value)}
                        className="flex-1"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="mt-1 w-full"
                        onClick={handleCustomSearch}
                        disabled={!categoryInputValue.trim()}
                      >
                        <Search className="mr-2 h-4 w-4" />
                        Search for categories
                      </Button>
                    </div>
                  )}
              </div>
            </div>
          </div>

          <div>
            <Label htmlFor="price">Price (AUD)</Label>
            <Input
              id="price"
              className="mt-1"
              type="number"
              value={price || undefined}
              placeholder="Price"
              onChange={(e) => setPrice(Number(e.target.value))}
            />
          </div>

          <div>
            <Label htmlFor="quantity">Quantity</Label>
            <Input
              id="quantity"
              className="mt-1"
              type="number"
              value={quantity || undefined}
              placeholder="Quantity"
              readOnly
            />
          </div>

          {createNewFulfillmentPolicy ? (
            <>
              <div
                className="cursor-pointer bg-muted p-2"
                onClick={() => setCreateNewFulfillmentPolicy(false)}
              >
                <ChevronLeft className="h-4 w-4" />
                <span className="ml-1 text-sm">Back to policy selection</span>
              </div>

              <div>
                <Label htmlFor="domesticShipping">
                  Domestic Shipping (AUD)
                </Label>
                <Input
                  id="domesticShipping"
                  className="mt-1"
                  type="number"
                  value={domesticShipping || undefined}
                  placeholder="Domestic shipping cost"
                  onChange={(e) => setDomesticShipping(Number(e.target.value))}
                />
              </div>

              <div>
                <Label htmlFor="internationalShipping">
                  International Shipping (AUD)
                </Label>
                <Input
                  id="internationalShipping"
                  className="mt-1"
                  type="number"
                  value={internationalShipping || undefined}
                  placeholder="International shipping cost"
                  onChange={(e) =>
                    setInternationalShipping(Number(e.target.value))
                  }
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="fulfillmentPolicy">Fulfillment Policy</Label>
                <Select
                  value={fulfillmentPolicy?.fulfillmentPolicyId ?? ""}
                  onValueChange={(value) => {
                    const policy = fulfillmentPolicies.data?.find(
                      (p) => p.fulfillmentPolicyId === value,
                    );
                    setFulfillmentPolicy(
                      policy as unknown as FulfillmentPolicyType | null,
                    );
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a fulfillment policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {fulfillmentPolicies.data?.map((policy) => (
                      <SelectItem
                        key={policy.fulfillmentPolicyId}
                        value={policy.fulfillmentPolicyId}
                      >
                        {policy.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Button
                variant="link"
                className="mt-0 justify-start p-0 text-sm"
                onClick={() => {
                  setFulfillmentPolicy(null);
                  setCreateNewFulfillmentPolicy(true);
                }}
              >
                Create new shipping policy
              </Button>
            </>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            onClick={handleListOnEbay}
            disabled={isSubmitting || !validated || !listingCars.data}
          >
            {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            List on eBay
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
