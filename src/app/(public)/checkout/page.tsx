"use client";

import { useState, useEffect } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Minus, Plus, Trash2, AlertCircle, Loader2 } from "lucide-react";
import Image from "next/image";
import { useMemo } from "react";
import { api } from "~/trpc/react";
import { formatCurrency } from "~/lib/utils";
import { useSearchParams } from "next/navigation";

import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { Separator } from "~/components/ui/separator";
import { Skeleton } from "~/components/ui/skeleton";
import { ScrollArea } from "~/components/ui/scroll-area";
import { useGoogleMapsApi } from "./_components/useGoogleMapsScript";
import {
  type CheckoutAddress,
  AddressAutoComplete,
} from "./_components/AddressAutocomplete";
import { toast } from "sonner";
import { Alert, AlertTitle, AlertDescription } from "~/components/ui/alert";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogCancel,
  AlertDialogAction,
} from "~/components/ui/alert-dialog";

// Define the form schema using zod
const checkoutFormSchema = z
  .object({
    name: z.string().min(1, "Name is required"),
    email: z
      .string()
      .min(1, "Email is required")
      .email("Invalid email address")
      .transform((val) => val.trim()),
    shipToCountryCode: z.string().min(1, "Country is required"),
    address: z.object({
      formattedAddress: z.string(),
      city: z.string(),
      region: z.string(),
      postalCode: z.string(),
    }),
    isB2B: z.boolean().default(false),
    acceptTerms: z
      .boolean()
      .default(false)
      .refine((val) => val === true, {
        message: "You must accept the terms and conditions",
      }),
  })
  .refine(
    (data) => {
      // If shipping to AU, address is required
      if (data.shipToCountryCode === "AU") {
        return !!data.address.formattedAddress;
      }
      return true;
    },
    {
      message: "Address is required for Australian deliveries",
      path: ["address.formattedAddress"],
    },
  );

type CheckoutFormValues = z.infer<typeof checkoutFormSchema>;

// Type for the combined cart item data
type PopulatedCartItem = {
  listingId: string;
  quantity: number;
  title?: string;
  price?: number | null;
  imageUrl?: string | null;
};

export default function Checkout() {
  const searchParams = useSearchParams();
  const [address, setAddress] = useState<CheckoutAddress>(
    localStorage.getItem("checkout-address")
      ? (JSON.parse(
          localStorage.getItem("checkout-address")!,
        ) as CheckoutAddress)
      : {
          formattedAddress: "",
          city: "",
          region: "",
          postalCode: "",
        },
  );

  const [pendingFormData, setPendingFormData] =
    useState<CheckoutFormValues | null>(null);

  const { isLoaded } = useGoogleMapsApi();
  const utils = api.useUtils();
  const { data: cart = [] } =
    api.cart.getCart.useQuery(undefined, { refetchOnWindowFocus: true });
  const removeItemMutation = api.cart.removeItem.useMutation({
    onSuccess: () => utils.cart.getCart.invalidate(),
  });
  const updateQuantityMutation = api.cart.updateItem.useMutation({
    onSuccess: () => utils.cart.getCart.invalidate(),
  });

  const shippingCountries = api.checkout.getShippingCountries.useQuery();

  // Extract listing IDs from the cart
  const listingIds = useMemo(() => cart.map((item) => item.listingId), [cart]);

  // Fetch listing details using tRPC
  const { data: listingsData, isLoading } = api.cart.getListingsByIds.useQuery(
    {
      ids: listingIds,
    },
    {
      enabled: !!listingIds.length,
      staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    },
  );

  const { data: shippingData } =
    api.cart.getCartShippingData.useQuery(
      {
        ids: listingIds,
      },
      { enabled: !!listingIds.length },
    );

  // Combine cart quantities with fetched listing data
  const populatedCart = useMemo((): PopulatedCartItem[] => {
    if (!listingsData) return cart.map((item) => ({ ...item }));

    const listingsMap = new Map(
      listingsData.map((listing) => [
        listing.id,
        {
          title: listing.title,
          price: listing.price,
          imageUrl: listing.images?.[0]?.url,
        },
      ]),
    );

    return cart.map((item) => ({
      ...item,
      ...(listingsMap.get(item.listingId) ?? {}),
    }));
  }, [cart, listingsData]);

  // Calculate totals
  const subtotal = useMemo(() => {
    return populatedCart.reduce(
      (total, item) => total + (item.price ?? 0) * item.quantity,
      0,
    );
  }, [populatedCart]);

  // Form setup
  const form = useForm<CheckoutFormValues>({
    resolver: zodResolver(checkoutFormSchema),
    defaultValues: {
      name: "",
      email: "",
      shipToCountryCode: "AU",
      address: {
        formattedAddress: "",
        city: "",
        region: "",
        postalCode: "",
      },
      isB2B: false,
      acceptTerms: false,
    },
  });

  const shippingServices = api.checkout.getShippingServices.useQuery(
    {
      destinationPostcode: address.postalCode ?? "",
      weight: shippingData?.cartWeight ?? 0,
      length: shippingData?.largestPart.length ?? 0,
      width: shippingData?.largestPart.width ?? 0,
      height: shippingData?.largestPart.height ?? 0,
      destinationCountry: form.watch("shipToCountryCode") || "AUSTRALIA",
      destinationCity: address.city ?? "",
      destinationState: address.region ?? "",
      b2b: form.watch("isB2B"),
    },
    {
      enabled:
        !!shippingData &&
        !!cart.length &&
        (!!address.postalCode || form.watch("shipToCountryCode") !== "AU"),
      retry: false,
    },
  );

  const { mutateAsync: getStripeCheckout } =
    api.checkout.getStripeCheckout.useMutation();

  // Update address validation when country changes
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "shipToCountryCode") {
        if (value.shipToCountryCode !== "AU") {
          // Reset address validation errors if country is not Australia
          form.clearErrors("address");

          // If changing from AU to another country, clear the address
          if (form.getValues("address.formattedAddress")) {
            const emptyAddress = {
              formattedAddress: "",
              city: "",
              region: "",
              postalCode: "",
            };
            setAddress(emptyAddress);
            form.setValue("address", emptyAddress);
          }
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  // Save address to localStorage when it changes
  useEffect(() => {
    localStorage.setItem("checkout-address", JSON.stringify(address));
    form.setValue("address", address);
  }, [address, form]);

  // Set initial address from localStorage if available
  useEffect(() => {
    const savedAddress = localStorage.getItem("checkout-address");
    if (savedAddress) {
      try {
        const parsedAddress = JSON.parse(savedAddress) as CheckoutAddress;
        setAddress(parsedAddress);
        form.setValue("address", parsedAddress);
      } catch (error) {
        console.error("Failed to parse saved address:", error);
      }
    }
  }, []);

  type ShippingServices = NonNullable<typeof shippingServices.data>["services"];

  const isPickupOnly = (services: ShippingServices) =>
    services
      .filter((s) => s.shipping_rate_data.display_name !== "Admin Shipping")
      .every((s) => s.shipping_rate_data.display_name === "Pickup from Parted Euro");

  const hasPickup = (services: ShippingServices) =>
    services.some((s) => s.shipping_rate_data.display_name === "Pickup from Parted Euro");

  async function proceedToStripe(data: CheckoutFormValues) {
    if (!shippingServices.data) return;

    const { url } = await getStripeCheckout({
      items: cart.map((item) => ({
        itemId: item.listingId,
        quantity: item.quantity,
      })),
      name: data.name,
      email: data.email,
      countryCode: data.shipToCountryCode,
      shippingOptions: shippingServices.data.services,
    });

    if (url) {
      window.location.href = url;
    } else {
      toast.error("Error while creating checkout session. Please try again.");
    }
  }

  async function onSubmit(data: CheckoutFormValues) {
    if (data.shipToCountryCode === "AU" && !data.address.formattedAddress) {
      form.setError("address.formattedAddress", {
        type: "manual",
        message: "Address is required for Australian deliveries",
      });
      return;
    }

    if (!shippingServices.data) {
      toast.error("Error while fetching shipping services. Please try again.");
      return;
    }

    const { services } = shippingServices.data;
    const pickupOnly = isPickupOnly(services);
    const noShipping = services.length === 0;

    if (!pickupOnly && !noShipping) {
      await proceedToStripe(data);
      return;
    }

    setPendingFormData(data);
  }

  if (!isLoaded) {
    return null; // Prevent hydration errors
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-6 text-2xl font-bold md:text-3xl">Checkout</h1>

      <div className="grid gap-8 md:grid-cols-[1fr_400px]">
        {/* Cart Summary */}
        <div className="order-2 md:order-1">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-4 text-xl font-semibold">Order Summary</h2>

            {cart.length === 0 ? (
              <div className="py-4 text-center text-muted-foreground">
                Your cart is empty.
              </div>
            ) : (
              <>
                <ScrollArea className="max-h-[350px] pr-4">
                  <div className="space-y-4">
                    {isLoading
                      ? Array.from({ length: cart.length }).map((_, i) => (
                          <CartItemSkeleton key={i} />
                        ))
                      : populatedCart.map((item) => (
                          <CartItem
                            key={item.listingId}
                            item={item}
                            onRemove={() =>
                              removeItemMutation.mutateAsync({
                                listingId: item.listingId,
                              })
                            }
                            onUpdateQuantity={(quantity) =>
                              updateQuantityMutation.mutateAsync({
                                listingId: item.listingId,
                                quantity,
                              })
                            }
                          />
                        ))}
                  </div>
                </ScrollArea>

                <Separator className="my-6" />

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Subtotal</span>
                    <span>{formatCurrency(subtotal)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span>Shipping</span>
                    <span className="text-muted-foreground">
                      Calculated at next step
                    </span>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="flex items-center justify-between font-medium">
                  <span>Total</span>
                  <span className="text-lg">{formatCurrency(subtotal)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Checkout Form */}
        <div className="order-1 md:order-2">
          <div className="rounded-lg border bg-card p-6 shadow-sm">
            <h2 className="mb-6 text-xl font-semibold">Shipping Information</h2>

            {searchParams.get("stripeError") === "true" && (
              <div className="mb-6">
                <Alert variant="destructive" className="relative">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Payment Error</AlertTitle>
                  <AlertDescription>
                    There was a problem with your payment. Please try again.
                  </AlertDescription>
                </Alert>
              </div>
            )}

            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-6"
              >
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Enter your full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="your.email@example.com"
                          {...field}
                        />
                      </FormControl>
                      <FormDescription>
                        We&apos;ll send your receipt to this email
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="shipToCountryCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Country</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        defaultValue={field.value}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a country" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="AU">AUSTRALIA</SelectItem>
                          {shippingCountries.data?.map((country) => (
                            <SelectItem key={country.code} value={country.code}>
                              {country.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {form.watch("shipToCountryCode") === "AU" && (
                  <FormField
                    control={form.control}
                    name="address"
                    render={() => (
                      <FormItem>
                        <FormLabel>Postcode / Suburb</FormLabel>
                        <FormControl>
                          <AddressAutoComplete
                            address={address}
                            setAddress={setAddress}
                            placeholder="Enter your postcode/suburb"
                          />
                        </FormControl>
                        <FormDescription>
                          Only your postcode/suburb is required for calculating
                          shipping. Full delivery address will be entered on the
                          next page.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <FormField
                  control={form.control}
                  name="isB2B"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>B2B Delivery</FormLabel>
                        <FormDescription>
                          This is a business address.
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="acceptTerms"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Terms and Conditions</FormLabel>
                        <FormDescription>
                          I agree to the terms of service and privacy policy
                        </FormDescription>
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="w-full"
                  disabled={cart.length === 0}
                >
                  Continue to Payment
                </Button>
              </form>
            </Form>
          </div>
        </div>
      </div>

      <AlertDialog
        open={pendingFormData !== null}
        onOpenChange={(open) => {
          if (!open) setPendingFormData(null);
        }}
      >
        <AlertDialogContent>
          {(() => {
            const b2bAvailable =
              shippingServices.data?.hasB2BOnlyServices ?? false;
            const pickup = shippingServices.data
              ? hasPickup(shippingServices.data.services)
              : false;

            if (pickup && !b2bAvailable) {
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Pickup Only</AlertDialogTitle>
                    <AlertDialogDescription>
                      No shipping options available for this order. You&apos;ll
                      need to collect from our Knoxfield, VIC warehouse.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        if (pendingFormData) {
                          void proceedToStripe(pendingFormData);
                        }
                      }}
                    >
                      Continue with Pickup
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            }

            if (pickup && b2bAvailable) {
              return (
                <>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Limited Shipping</AlertDialogTitle>
                    <AlertDialogDescription>
                      Shipping for this order is only available to business
                      addresses. Enable B2B Delivery to see shipping options, or
                      continue with pickup only.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setPendingFormData(null);
                        form.setValue("isB2B", true);
                      }}
                    >
                      Enable B2B
                    </Button>
                    <AlertDialogAction
                      onClick={() => {
                        if (pendingFormData) {
                          void proceedToStripe(pendingFormData);
                        }
                      }}
                    >
                      Continue with Pickup
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </>
              );
            }

            // No shipping + B2B available (international)
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle>Shipping Unavailable</AlertDialogTitle>
                  <AlertDialogDescription>
                    Shipping for this order is only available to business
                    addresses. Enable B2B Delivery to see shipping options.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      setPendingFormData(null);
                      form.setValue("isB2B", true);
                    }}
                  >
                    Enable B2B
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Cart item component
function CartItem({
  item,
  onRemove,
  onUpdateQuantity,
}: {
  item: PopulatedCartItem;
  onRemove: () => Promise<unknown>;
  onUpdateQuantity: (quantity: number) => Promise<unknown>;
}) {
  const [isRemoving, setIsRemoving] = useState(false);
  const [isIncLoading, setIsIncLoading] = useState(false);
  const [isDecLoading, setIsDecLoading] = useState(false);
  const handleRemove = async () => {
    setIsRemoving(true);
    try {
      await onRemove();
    } finally {
      setIsRemoving(false);
    }
  };
  const handleDec = async () => {
    setIsDecLoading(true);
    try {
      await onUpdateQuantity(Math.max(1, item.quantity - 1));
    } finally {
      setIsDecLoading(false);
    }
  };
  const handleInc = async () => {
    setIsIncLoading(true);
    try {
      await onUpdateQuantity(item.quantity + 1);
    } finally {
      setIsIncLoading(false);
    }
  };
  return (
    <div className="flex items-start gap-4 rounded-md border p-3">
      {/* Product image */}
      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-secondary">
        {item.imageUrl ? (
          <Image
            src={item.imageUrl}
            alt={item.title ?? "Product"}
            fill
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-muted" />
        )}
      </div>

      {/* Product details */}
      <div className="flex flex-1 flex-col">
        <div className="flex items-start justify-between">
          <div>
            <h4 className="font-medium">{item.title ?? "Loading..."}</h4>
            <p className="text-sm text-muted-foreground">
              {item.price ? formatCurrency(item.price) : ""}
            </p>
          </div>
          <button
            className="text-muted-foreground hover:text-destructive disabled:opacity-50"
            onClick={handleRemove}
            aria-label="Remove item"
            disabled={isRemoving || isIncLoading || isDecLoading}
          >
            {isRemoving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
          </button>
        </div>

        {/* Quantity controls */}
        <div className="mt-2 flex items-center">
          <button
            className="rounded-md p-1 hover:bg-muted disabled:opacity-50"
            onClick={handleDec}
            disabled={
              item.quantity <= 1 || isDecLoading || isIncLoading || isRemoving
            }
            aria-label="Decrease quantity"
          >
            {isDecLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Minus className="h-3 w-3" />
            )}
          </button>
          <span className="min-w-8 text-center">{item.quantity}</span>
          <button
            className="rounded-md p-1 hover:bg-muted disabled:opacity-50"
            onClick={handleInc}
            aria-label="Increase quantity"
            disabled={isIncLoading || isDecLoading || isRemoving}
          >
            {isIncLoading ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Plus className="h-3 w-3" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Skeleton loading state for cart items
function CartItemSkeleton() {
  return (
    <div className="flex items-start gap-4 rounded-md border p-3">
      <Skeleton className="h-16 w-16 shrink-0 rounded-md" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="h-3 w-1/4" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-6 w-6 rounded-md" />
          <Skeleton className="h-4 w-8" />
          <Skeleton className="h-6 w-6 rounded-md" />
        </div>
      </div>
    </div>
  );
}
