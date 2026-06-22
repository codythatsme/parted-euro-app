"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Compressor from "compressorjs";
import { Eye, ImageOff, Plus, Trash2 } from "lucide-react";
import { useEffect } from "react";
import {
  type Control,
  useFieldArray,
  useForm,
  useWatch,
} from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { UploadDropzone } from "~/components/MediaUpload";
import { ContactCard, type ContactCardData } from "~/components/contact-card";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
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
  heroImageUrl: z
    .string()
    .url("Must be a valid URL")
    .nullable()
    .or(z.literal("").transform(() => null)),
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
  heroImageUrl: string | null;
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
      heroImageUrl: initial.heroImageUrl,
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
      heroImageUrl: initial.heroImageUrl,
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
      heroImageUrl: values.heroImageUrl,
      businessHoursTitle: values.businessHoursTitle,
      businessHoursNote: values.businessHoursNote.trim() || null,
      businessHoursLines: values.businessHoursLines.map((l) => l.value),
    });
  };

  return (
    <Form {...form}>
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
            <CardTitle>Hero image</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="heroImageUrl"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Background image</FormLabel>
                  <FormControl>
                    <HeroImageField
                      value={field.value}
                      onChange={field.onChange}
                    />
                  </FormControl>
                  <FormDescription>
                    Shown behind the page heading. Falls back to a dark
                    gradient when empty.
                  </FormDescription>
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
          <PreviewDialog control={form.control} />
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
    </Form>
  );
}

function PreviewDialog({ control }: { control: Control<FormValues> }) {
  const v = useWatch({ control });

  const data: ContactCardData = {
    heading: v.heading ?? "",
    cardTitle: v.cardTitle ?? "",
    address: v.address ?? "",
    mapsUrl: v.mapsUrl ?? "",
    phoneDisplay: v.phoneDisplay ?? "",
    phoneHref: v.phoneHref ?? "",
    email: v.email ?? "",
    heroImageUrl: v.heroImageUrl ?? null,
    businessHoursTitle: v.businessHoursTitle ?? "",
    businessHoursNote: v.businessHoursNote?.trim() ? v.businessHoursNote : null,
    businessHoursLines: (v.businessHoursLines ?? [])
      .map((l) => l?.value ?? "")
      .filter((line) => line.length > 0),
  };

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline">
          <Eye className="mr-2 h-4 w-4" /> Preview
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] max-w-6xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview</DialogTitle>
        </DialogHeader>
        <div className="rounded-lg bg-gradient-to-b from-background to-muted p-4 sm:p-6">
          <ContactCard data={data} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

function HeroImageField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
}) {
  if (value) {
    return (
      <div className="space-y-3">
        <div className="overflow-hidden rounded-md border">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Hero preview"
            className="h-48 w-full object-cover"
          />
        </div>
        <div className="flex justify-end">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(null)}
          >
            <ImageOff className="mr-2 h-4 w-4" /> Remove
          </Button>
        </div>
      </div>
    );
  }

  return (
    <UploadDropzone
      endpoint="contactImage"
      config={{ mode: "auto" }}
      onBeforeUploadBegin={(files) =>
        Promise.all(files.map((file) => compressImage(file)))
      }
      onClientUploadComplete={(res) => {
        const url = res?.[0]?.url;
        if (url) {
          onChange(url);
          toast.success("Hero image uploaded");
        }
      }}
      onUploadError={(err) => toast.error(`Upload failed: ${err.message}`)}
    />
  );
}

function compressImage(file: File): Promise<File> {
  return new Promise((resolve) => {
    if (!file.type.startsWith("image/")) {
      resolve(file);
      return;
    }
    new Compressor(file, {
      quality: 0.85,
      maxWidth: 2400,
      maxHeight: 1400,
      convertSize: 1_000_000,
      success: (compressed) =>
        resolve(
          new File([compressed], file.name, { type: compressed.type }),
        ),
      error: () => resolve(file),
    });
  });
}
