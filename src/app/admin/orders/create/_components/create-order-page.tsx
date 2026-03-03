"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import { toast } from "sonner";
import { Loader2, ArrowLeft } from "lucide-react";
import { api } from "~/trpc/react";
import {
  ListingSearch,
  type SelectedPart,
} from "./listing-search";
import {
  OrderItemsTable,
  type OrderPartRow,
} from "./order-items-table";
import Link from "next/link";

const formSchema = z.object({
  shippingMethod: z.string().default("Standard Shipping"),
  postageCost: z.number().min(0).default(0),
  name: z.string().default(""),
  email: z.string().default(""),
  countryCode: z.string().default("AU"),
  phone: z.string().default(""),
});

type FormData = z.infer<typeof formSchema>;

export function CreateOrderPage() {
  const router = useRouter();
  const [items, setItems] = useState<OrderPartRow[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const utils = api.useUtils();
  const shippingCountriesQuery = api.checkout.getShippingCountries.useQuery();

  const {
    control,
    getValues,
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

  const createDirectCashOrderMutation =
    api.xero.createDirectCashOrder.useMutation({
      onSuccess: async () => {
        toast.success("Cash order created");
        await utils.orders.getAllAdmin.invalidate();
        router.push("/admin/orders");
      },
      onError: (error) => {
        toast.error("Failed: " + error.message);
        setIsSubmitting(false);
      },
    });

  const markPartsSoldDirectMutation =
    api.listings.markPartsSoldDirect.useMutation({
      onSuccess: async () => {
        toast.success("eBay order created. Inventory marked sold.");
        await utils.orders.getAllAdmin.invalidate();
        router.push("/admin/orders");
      },
      onError: (error) => {
        toast.error("Failed: " + error.message);
        setIsSubmitting(false);
      },
    });

  const getDirectStripeCheckoutMutation =
    api.checkout.getDirectStripeCheckout.useMutation();

  const hasItems = items.length > 0;

  const handleAddPart = (part: SelectedPart) => {
    setItems((prev) => [
      ...prev,
      {
        partId: part.partId,
        listingId: part.listingId,
        listingTitle: part.listingTitle,
        partNo: part.partNo,
        variant: part.variant,
        donorVin: part.donorVin,
        priceValue: part.price.toString(),
      },
    ]);
  };

  const buildItemsPayload = () =>
    items.map((item) => ({
      partId: item.partId,
      description: [
        item.listingTitle,
        item.variant ? `(${item.variant})` : null,
      ]
        .filter(Boolean)
        .join(" "),
      price: parseFloat(item.priceValue) || 0,
    }));

  const handleCashPayment = () => {
    setIsSubmitting(true);
    const data = getValues();
    createDirectCashOrderMutation.mutate({
      name: data.name,
      email: data.email,
      phone: data.phone,
      shippingMethod: data.shippingMethod,
      postageCost: data.postageCost,
      countryCode: data.countryCode,
      items: buildItemsPayload(),
    });
  };

  const handleStripePayment = async () => {
    const data = getValues();
    if (!data.email || !data.name) {
      toast.error("Name and email required for Stripe checkout");
      return;
    }
    setIsSubmitting(true);
    try {
      const result = await getDirectStripeCheckoutMutation.mutateAsync({
        name: data.name,
        email: data.email,
        shippingMethod: data.shippingMethod,
        postageCost: data.postageCost,
        countryCode: data.countryCode,
        items: buildItemsPayload(),
      });

      if (result.url) {
        void navigator.clipboard.writeText(result.url);
        toast.success("Stripe payment URL copied to clipboard");
      }
    } catch {
      toast.error("Failed to create Stripe checkout session");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEbayOrder = () => {
    setIsSubmitting(true);
    const data = getValues();
    markPartsSoldDirectMutation.mutate({
      name: data.name,
      email: data.email,
      phone: data.phone,
      shippingMethod: data.shippingMethod,
      postageCost: data.postageCost,
      countryCode: data.countryCode,
      items: buildItemsPayload(),
    });
  };

  const canSubmit = hasItems && !isSubmitting;

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="mb-6 flex items-center gap-4">
        <Link href="/admin/orders">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <h1 className="text-3xl font-bold">Create Order</h1>
      </div>

      <div className="space-y-8">
        {/* Part Search */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Add Parts</h2>
          <ListingSearch
            onSelect={handleAddPart}
            excludePartIds={items.map((i) => i.partId)}
          />
        </section>

        {/* Order Items */}
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Order Items</h2>
          <OrderItemsTable
            items={items}
            onPriceChange={(partId, v) =>
              setItems((prev) =>
                prev.map((item) =>
                  item.partId === partId
                    ? { ...item, priceValue: v }
                    : item,
                ),
              )
            }
            onRemove={(partId) =>
              setItems((prev) => prev.filter((item) => item.partId !== partId))
            }
          />
        </section>

        {/* Customer & Shipping */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Customer & Shipping</h2>
          <form className="grid grid-cols-2 gap-4">
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
          </form>
        </section>

        {/* Actions */}
        <section className="flex justify-end gap-2 border-t pt-6">
          <Button
            variant="secondary"
            onClick={handleEbayOrder}
            disabled={!canSubmit}
          >
            {markPartsSoldDirectMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Create eBay Order
          </Button>
          <Button
            variant="secondary"
            onClick={handleCashPayment}
            disabled={!canSubmit}
          >
            {createDirectCashOrderMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Paid in Cash
          </Button>
          <Button
            onClick={handleStripePayment}
            disabled={!canSubmit}
          >
            {getDirectStripeCheckoutMutation.isPending && (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            )}
            Get Stripe URL
          </Button>
        </section>
      </div>
    </div>
  );
}
