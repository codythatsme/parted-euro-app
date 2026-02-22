"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { toast } from "sonner";
import { api } from "~/trpc/react";
import { type AdminOrdersItem } from "~/trpc/shared";

const formSchema = z.object({
  trackingNumber: z.string().min(1, {
    message: "Tracking number is required",
  }),
  carrier: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface AddTrackingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: AdminOrdersItem;
  onSuccess: () => void;
}

export function AddTrackingDialog({
  open,
  onOpenChange,
  order,
  onSuccess,
}: AddTrackingDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const defaultValues: Partial<FormData> = {
    trackingNumber: order.trackingNumber ?? "",
    carrier: order.carrier ?? "",
  };

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  const updateOrderMutation = api.orders.updateTracking.useMutation({
    onSuccess: () => {
      toast.success(
        "Tracking information updated and shipping notification email sent",
      );
      onSuccess();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(`Error updating tracking information: ${error.message}`);
      setIsSubmitting(false);
    },
  });

  const onSubmit = (data: FormData) => {
    setIsSubmitting(true);
    updateOrderMutation.mutate({
      orderId: order.id,
      trackingNumber: data.trackingNumber,
      carrier: data.carrier,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Add Tracking Information</DialogTitle>
          <DialogDescription>
            Add or update tracking information for order {order.id}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="trackingNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tracking Number</FormLabel>
                  <FormControl>
                    <Input placeholder="Enter tracking number" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="carrier"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Carrier (Optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="e.g., Australia Post, DHL, FedEx"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Saving..." : "Save Tracking"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
