"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import {
  type Control,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { ContactCard, type ContactCardData } from "~/components/contact-card";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
import { Textarea } from "~/components/ui/textarea";
import { api } from "~/trpc/react";

const formSchema = z.object({
  heading: z.string().min(1, "Required").max(120),
  cardTitle: z.string().min(1, "Required").max(120),
  address: z.string().min(1, "Required").max(500),
  mapsUrl: z.string().url("Must be a URL"),
  phoneDisplay: z.string().min(1, "Required").max(40),
  phoneHref: z
    .string()
    .regex(/^tel:/, 'Must start with "tel:" (e.g. tel:+61431133764)'),
  email: z.string().email("Must be a valid email"),
  businessHoursTitle: z.string().min(1, "Required").max(120),
  businessHoursNote: z.string().max(200),
  businessHoursLines: z
    .array(z.object({ value: z.string().min(1, "Cannot be empty").max(200) }))
    .max(20),
});

type FormValues = z.infer<typeof formSchema>;

type Initial = {
  heading: string;
  cardTitle: string;
  address: string;
  mapsUrl: string;
  phoneDisplay: string;
  phoneHref: string;
  email: string;
  businessHoursTitle: string;
  businessHoursNote: string | null;
  businessHoursLines: string[];
};

export function ContactForm({ initial }: { initial: Initial }) {
  const utils = api.useUtils();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      heading: initial.heading,
      cardTitle: initial.cardTitle,
      address: initial.address,
      mapsUrl: initial.mapsUrl,
      phoneDisplay: initial.phoneDisplay,
      phoneHref: initial.phoneHref,
      email: initial.email,
      businessHoursTitle: initial.businessHoursTitle,
      businessHoursNote: initial.businessHoursNote ?? "",
      businessHoursLines: initial.businessHoursLines.map((value) => ({ value })),
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "businessHoursLines",
  });

  const update = api.pages.contact.update.useMutation({
    onSuccess: () => {
      toast.success("Contact page saved");
      void utils.pages.contact.get.invalidate();
    },
    onError: (e) => toast.error(`Save failed: ${e.message}`),
  });

  useEffect(() => {
    form.reset({
      heading: initial.heading,
      cardTitle: initial.cardTitle,
      address: initial.address,
      mapsUrl: initial.mapsUrl,
      phoneDisplay: initial.phoneDisplay,
      phoneHref: initial.phoneHref,
      email: initial.email,
      businessHoursTitle: initial.businessHoursTitle,
      businessHoursNote: initial.businessHoursNote ?? "",
      businessHoursLines: initial.businessHoursLines.map((value) => ({ value })),
    });
  }, [initial, form]);

  const onSubmit = (values: FormValues) => {
    update.mutate({
      heading: values.heading,
      cardTitle: values.cardTitle,
      address: values.address,
      mapsUrl: values.mapsUrl,
      phoneDisplay: values.phoneDisplay,
      phoneHref: values.phoneHref,
      email: values.email,
      businessHoursTitle: values.businessHoursTitle,
      businessHoursNote: values.businessHoursNote.trim() || null,
      businessHoursLines: values.businessHoursLines.map((l) => l.value),
    });
  };

  return (
    <Form {...form}>
      <div className="grid gap-8 lg:grid-cols-2">
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Header</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="heading"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Page heading</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="cardTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Card title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Location</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Address</FormLabel>
                  <FormControl>
                    <Textarea rows={2} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="mapsUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Google Maps URL</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="https://maps.google.com/?q=..."
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Used for the address link target.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Contact methods</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="phoneDisplay"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (display)</FormLabel>
                  <FormControl>
                    <Input placeholder="0431 133 764" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="phoneHref"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone (tel: link)</FormLabel>
                  <FormControl>
                    <Input placeholder="tel:+61431133764" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="contact@partedeuro.com.au"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Business hours</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="businessHoursTitle"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Section title</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="businessHoursNote"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Note (optional)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="(Via appointment only)"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="space-y-2">
              <FormLabel>Hours lines</FormLabel>
              {fields.length === 0 && (
                <p className="text-sm text-muted-foreground">
                  No lines yet. Add one below.
                </p>
              )}
              {fields.map((f, i) => (
                <div key={f.id} className="flex items-start gap-2">
                  <FormField
                    control={form.control}
                    name={`businessHoursLines.${i}.value`}
                    render={({ field }) => (
                      <FormItem className="flex-1">
                        <FormControl>
                          <Input
                            placeholder="Monday to Friday 9am - 5pm"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => remove(i)}
                    aria-label={`Remove line ${i + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ value: "" })}
              >
                <Plus className="mr-1 h-4 w-4" /> Add line
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={!form.formState.isDirty || update.isPending}
            onClick={() => form.reset()}
          >
            Reset
          </Button>
          <Button
            type="submit"
            disabled={!form.formState.isDirty || update.isPending}
          >
            {update.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
        </form>
        <ContactPreview control={form.control} />
      </div>
    </Form>
  );
}

function ContactPreview({ control }: { control: Control<FormValues> }) {
  const v = useWatch({ control });

  const data: ContactCardData = {
    heading: v.heading ?? "",
    cardTitle: v.cardTitle ?? "",
    address: v.address ?? "",
    mapsUrl: v.mapsUrl ?? "",
    phoneDisplay: v.phoneDisplay ?? "",
    phoneHref: v.phoneHref ?? "",
    email: v.email ?? "",
    businessHoursTitle: v.businessHoursTitle ?? "",
    businessHoursNote: v.businessHoursNote?.trim() ? v.businessHoursNote : null,
    businessHoursLines: (v.businessHoursLines ?? [])
      .map((l) => l?.value ?? "")
      .filter((line) => line.length > 0),
  };

  return (
    <div className="lg:sticky lg:top-20 lg:self-start">
      <div className="rounded-lg border bg-gradient-to-b from-background to-muted px-4 py-8 shadow-sm">
        <ContactCard data={data} />
      </div>
    </div>
  );
}
