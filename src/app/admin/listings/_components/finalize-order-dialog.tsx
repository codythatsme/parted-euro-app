"use client";

import { useState } from "react";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { toast } from "sonner";
import { Loader2, X } from "lucide-react";
import { api } from "~/trpc/react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { type OrderItem } from "./bulk-order-dialog";
import { type AdminListingsItem } from "~/trpc/shared";

// Define the form schema using Zod
const formSchema = z.object({
  shippingMethod: z.string().min(1, "Shipping method is required"),
  postageCost: z.number().min(0, "Postage cost must be 0 or greater"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  countryCode: z.string().min(1, "Country is required"),
  phone: z.string().min(1, "Phone number is required"),
});

type FormData = z.infer<typeof formSchema>;

interface FinalizeOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderItems: OrderItem[];
  listings: AdminListingsItem[];
  onOrderComplete: () => void;
}

export function FinalizeOrderDialog({
  open,
  onOpenChange,
  orderItems,
  listings,
  onOrderComplete,
}: FinalizeOrderDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      shippingMethod: "Standard Shipping",
      postageCost: 0,
      name: "",
      email: "",
      countryCode: "AU",
      phone: "",
    },
  });

  // Fetch shipping countries
  const shippingCountriesQuery = api.checkout.getShippingCountries.useQuery();

  // Mutation for creating a cash order
  const createCashOrderMutation = api.xero.createCashOrder.useMutation({
    onSuccess: () => {
      toast.success("Order created and invoice sent");
      onOrderComplete();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error("Failed to create order: " + error.message);
      setIsSubmitting(false);
    },
  });

  // Prepare checkout session query (for Stripe URL)
  const createCheckoutQuery = api.checkout.getStripeCheckout.useMutation();

  const handleCashPayment = async (data: FormData) => {
    setIsSubmitting(true);
    createCashOrderMutation.mutate({
      name: data.name,
      email: data.email,
      shippingMethod: data.shippingMethod,
      phone: data.phone,
      postageCost: data.postageCost,
      countryCode: data.countryCode,
      items: orderItems.map((item) => ({
        itemId: item.listingId,
        price: item.price,
        quantity: item.quantity,
      })),
    });
  };

  const handleStripePayment = async () => {
    setIsSubmitting(true);
    try {
      const result = await createCheckoutQuery.mutateAsync({
        name: watch("name"),
        email: watch("email"),
        shippingOptions: [
          {
            shipping_rate_data: {
              type: "fixed_amount",
              fixed_amount: {
                amount: Math.round(watch("postageCost") * 100),
                currency: "AUD",
              },
              display_name: watch("shippingMethod"),
            },
          },
        ],
        countryCode: watch("countryCode"),
        items: orderItems.map((item) => ({
          itemId: item.listingId,
          quantity: item.quantity,
        })),
      });

      if (result.url) {
        void navigator.clipboard.writeText(result.url);
        toast.success("Stripe payment URL copied to clipboard");
      }
    } catch (_error) {
      toast.error("Failed to create Stripe checkout session");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Get total price of all items in order
  const totalPrice = orderItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0,
  );
  
  const formatPrice = (dollars: number) => {
    return (dollars).toFixed(2);
  };

  // Remove an item from the order
  const handleRemoveItem = (listingId: string) => {
    const updatedOrderItems = orderItems.filter(
      (item) => item.listingId !== listingId,
    );
    if (updatedOrderItems.length === 0) {
      onOpenChange(false);
      onOrderComplete();
    } else {
      // Need to update parent state
      toast.success("Item removed from order");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Finalize Order</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border p-4">
            <h4 className="mb-2 text-lg font-bold">Order Items</h4>
            <div className="max-h-[200px] space-y-4 overflow-y-auto">
              {orderItems.map((item) => {
                const listing = listings.find((l) => l.id === item.listingId);
                if (!listing) return null;

                return (
                  <div
                    key={item.listingId}
                    className="flex justify-between rounded-md border p-3"
                  >
                    <div className="flex-1">
                      <h5 className="font-medium">{listing.title}</h5>
                      <div className="mt-1 text-sm text-muted-foreground">
                        <div>Price: ${formatPrice(item.price)}</div>
                        <div>Quantity: {item.quantity}</div>
                        <div>
                          Subtotal: ${formatPrice(item.price * item.quantity)}
                        </div>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => handleRemoveItem(item.listingId)}
                    >
                      <X className="h-4 w-4" />
                      <span className="sr-only">Remove item</span>
                    </Button>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex items-center justify-between border-t pt-2">
              <span className="font-bold">Total:</span>
              <span className="font-bold">${formatPrice(totalPrice)}</span>
            </div>
          </div>

          <form className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="shippingMethod">Shipping Method</Label>
                <Controller
                  name="shippingMethod"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} id="shippingMethod" />
                  )}
                />
                {errors.shippingMethod && (
                  <p className="text-sm text-destructive">
                    {errors.shippingMethod.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="postageCost">Postage Cost</Label>
                <Controller
                  name="postageCost"
                  control={control}
                  render={({ field }) => (
                    <Input
                      {...field}
                      id="postageCost"
                      type="text"
                      inputMode="decimal"
                      onChange={(e) =>
                        field.onChange(
                          e.target.value === ""
                            ? 0
                            : parseFloat(e.target.value),
                        )
                      }
                    />
                  )}
                />
                {errors.postageCost && (
                  <p className="text-sm text-destructive">
                    {errors.postageCost.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Controller
                  name="name"
                  control={control}
                  render={({ field }) => <Input {...field} id="name" />}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">
                    {errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Controller
                  name="email"
                  control={control}
                  render={({ field }) => (
                    <Input {...field} id="email" type="email" />
                  )}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">
                    {errors.email.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Controller
                  name="phone"
                  control={control}
                  render={({ field }) => <Input {...field} id="phone" />}
                />
                {errors.phone && (
                  <p className="text-sm text-destructive">
                    {errors.phone.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="countryCode">Country</Label>
                <Controller
                  name="countryCode"
                  control={control}
                  render={({ field }) => (
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      defaultValue={field.value}
                    >
                      <SelectTrigger id="countryCode">
                        <SelectValue placeholder="Select a country" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="AU">AUSTRALIA</SelectItem>
                        {shippingCountriesQuery.data?.map((country) => (
                          <SelectItem key={country.code} value={country.code}>
                            {country.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
                {errors.countryCode && (
                  <p className="text-sm text-destructive">
                    {errors.countryCode.message}
                  </p>
                )}
              </div>
            </div>

            <div className="flex justify-end space-x-2 pt-4">
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
                variant="secondary"
                onClick={handleSubmit(handleCashPayment)}
                disabled={isSubmitting}
              >
                {createCashOrderMutation.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Paid in Cash
              </Button>
              <Button
                type="button"
                onClick={handleSubmit(handleStripePayment)}
                disabled={isSubmitting}
              >
                {createCheckoutQuery.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Get Stripe URL
              </Button>
            </div>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
