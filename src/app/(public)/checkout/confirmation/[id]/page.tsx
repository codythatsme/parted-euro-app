import { notFound } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Package, Truck } from "lucide-react";
import { api } from "~/trpc/server";
import { formatCurrency, formatDate } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Separator } from "~/components/ui/separator";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { ClearCartOnLoad } from "./clear-cart";

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch order data with items
  const order = await api.order.getOrderWithItems(id);

  if (!order) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <ClearCartOnLoad />
      <div className="mb-6 space-y-4">
        <Link
          href="/"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Home
        </Link>

        <div className="flex flex-col items-center justify-center space-y-2 text-center md:items-start md:text-left">
          <div className="flex items-center gap-2 text-primary">
            <CheckCircle2 className="h-6 w-6" />
            <h1 className="text-2xl font-bold md:text-3xl">Order Confirmed</h1>
          </div>
          <p className="text-muted-foreground">
            Thank you for your order! We&apos;ve sent a confirmation to{" "}
            {order.email}
          </p>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-[1fr_350px]">
        {/* Order Details */}
        <div className="space-y-8">
          {/* Order Items */}
          <Card>
            <CardHeader className="px-6">
              <CardTitle className="text-xl">Order Items</CardTitle>
            </CardHeader>
            <CardContent className="px-6">
              <div className="space-y-4">
                {!order.orderItems || order.orderItems.length === 0 ? (
                  <p className="py-4 text-center text-muted-foreground">
                    No items found
                  </p>
                ) : (
                  <div className="space-y-4">
                    {order.orderItems.map((item) => {
                      const title = item.listing?.title ?? item.description ?? "Direct sale";
                      const imageUrl = item.listing?.images?.[0]?.url;
                      const price = item.unitPrice;
                      return (
                      <div key={item.id} className="flex space-x-4">
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border bg-secondary">
                          {imageUrl ? (
                            <Image
                              src={imageUrl}
                              alt={title}
                              fill
                              className="object-cover"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Package className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-1 flex-col">
                          <h4 className="font-medium">{title}</h4>
                          <div className="mt-1 flex justify-between">
                            <span className="text-sm text-muted-foreground">
                              Qty: {item.quantity}
                            </span>
                            <span className="font-medium">
                              {formatCurrency(price * item.quantity)}
                            </span>
                          </div>
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Shipping Information */}
          <Card>
            <CardHeader className="flex flex-row items-center px-6">
              <Truck className="mr-2 h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-xl">Shipping Information</CardTitle>
            </CardHeader>
            <CardContent className="px-6">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                    Shipping Address
                  </h3>
                  <p className="text-sm">
                    {order.shippingAddress ?? "Not available"}
                  </p>
                </div>
                <div>
                  <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                    Shipping Method
                  </h3>
                  <p className="text-sm">
                    {order.shippingMethod ?? "Standard Shipping"}
                  </p>
                </div>
                {order.trackingNumber && (
                  <div className="sm:col-span-2">
                    <h3 className="mb-1 text-sm font-medium text-muted-foreground">
                      Tracking Number
                    </h3>
                    <p className="text-sm font-medium">
                      {order.trackingNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Carrier: {order.carrier ?? "Not specified"}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Order Summary */}
        <div>
          <Card className="sticky top-4">
            <CardHeader className="px-6">
              <CardTitle className="text-xl">Order Summary</CardTitle>
            </CardHeader>
            <CardContent className="px-6">
              <div className="space-y-4">
                <div>
                  <h3 className="mb-2 font-medium">Order Details</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">
                        Order Number
                      </span>
                      <span className="font-medium">
                        {order.id.slice(-8).toUpperCase()}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Date</span>
                      <span>{formatDate(order.createdAt, "PP")}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className="capitalize">
                        {order.status.toLowerCase()}
                      </span>
                    </div>
                  </div>
                </div>

                <Separator />

                <div>
                  <h3 className="mb-2 font-medium">Payment</h3>
                  <div className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Subtotal</span>
                      <span>{formatCurrency(order.subtotal / 100)}</span>
                    </div>
                    {order.shipping != null && (
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Shipping</span>
                        <span>{formatCurrency(order.shipping / 100)}</span>
                      </div>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex justify-between font-medium">
                  <span>Total</span>
                  <span className="text-lg">
                    {formatCurrency(
                      (order.subtotal + (order.shipping ?? 0)) / 100,
                    )}
                  </span>
                </div>

                <div className="pt-4">
                  <Button asChild className="w-full">
                    <Link href="/listings">Continue Shopping</Link>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
