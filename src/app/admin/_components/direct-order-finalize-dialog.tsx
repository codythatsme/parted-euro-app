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
import { usePendingOrder } from "~/components/pending-order-provider";

const formSchema = z.object({
  shippingMethod: z.string().min(1, "Shipping method is required"),
  postageCost: z.number().min(0, "Postage cost must be 0 or greater"),
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Invalid email address"),
  countryCode: z.string().min(1, "Country is required"),
  phone: z.string().min(1, "Phone number is required"),
});

type FormData = z.infer<typeof formSchema>;

const formatPrice = (dollars: number) => dollars.toFixed(2);

export function DirectOrderFinalizeDialog() {
  const { items, removeItem, updatePrice, clear, isFinalizeOpen, closeFinalize } =
    usePendingOrder();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      shippingMethod: "Pickup",
      postageCost: 0,
      name: "",
      email: "",
      countryCode: "AU",
      phone: "",
    },
  });

  const shippingCountriesQuery = api.checkout.getShippingCountries.useQuery();

  const createDirectCashOrder = api.xero.createDirectCashOrder.useMutation({
    onSuccess: () => {
      toast.success("Order created and invoice sent");
      clear();
      reset();
      closeFinalize();
    },
    onError: (error) => {
      toast.error("Failed to create order: " + error.message);
      setIsSubmitting(false);
    },
  });

  const createDirectStripeCheckout =
    api.checkout.getDirectStripeCheckout.useMutation();

  const handleCashPayment = (data: FormData) => {
    setIsSubmitting(true);
    createDirectCashOrder.mutate({
      name: data.name,
      email: data.email,
      phone: data.phone,
      shippingMethod: data.shippingMethod,
      postageCost: data.postageCost,
      countryCode: data.countryCode,
      items: items.map((item) => ({
        partId: item.partId,
        description: item.description,
        price: item.price,
      })),
    });
  };

  const handleStripePayment = async () => {
    setIsSubmitting(true);
    try {
      const result = await createDirectStripeCheckout.mutateAsync({
        name: watch("name"),
        email: watch("email"),
        countryCode: watch("countryCode"),
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
        items: items.map((item) => ({
          partId: item.partId,
          description: item.description,
          price: item.price,
        })),
      });

      if (result.url) {
        void navigator.clipboard.writeText(result.url);
        toast.success("Stripe payment URL copied to clipboard");
        clear();
        reset();
        closeFinalize();
      }
    } catch (_error) {
      toast.error("Failed to create Stripe checkout session");
    } finally {
      setIsSubmitting(false);
    }
  };

  const totalPrice =
    items.reduce((sum, item) => sum + item.price, 0) + (watch("postageCost") ?? 0);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeFinalize();
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isFinalizeOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>Finalize Direct Order</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="rounded-md border p-4">
            <h4 className="mb-2 text-lg font-bold">Order Items</h4>
            <div className="max-h-[200px] space-y-2 overflow-y-auto">
              {items.map((item) => (
                <div
                  key={item.partId}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div className="flex-1">
                    <h5 className="font-medium">{item.description}</h5>
                    <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <span>Price: $</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        className="h-7 w-24"
                        value={item.price}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          if (!isNaN(val)) updatePrice(item.partId, val);
                        }}
                      />
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => removeItem(item.partId)}
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Remove item</span>
                  </Button>
                </div>
              ))}
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
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={handleSubmit(handleCashPayment)}
                disabled={isSubmitting || items.length === 0}
              >
                {createDirectCashOrder.isPending && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                Paid in Cash
              </Button>
              <Button
                type="button"
                onClick={handleSubmit(handleStripePayment)}
                disabled={isSubmitting || items.length === 0}
              >
                {createDirectStripeCheckout.isPending && (
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
