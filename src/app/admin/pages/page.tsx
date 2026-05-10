import { type Metadata } from "next";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

export const metadata: Metadata = { title: "Pages" };

const pages = [
  {
    href: "/admin/pages/contact",
    title: "Contact",
    description: "Address, phone, email, business hours.",
  },
  {
    href: "/admin/pages/warranty",
    title: "Warranty",
    description: "Long-form warranty policy with callouts.",
  },
];

export default function Page() {
  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Pages</h1>
        <p className="text-sm text-muted-foreground">
          Editable public pages. Each has a tailored editor.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {pages.map((p) => (
          <Link key={p.href} href={p.href} className="block">
            <Card className="h-full transition-colors hover:bg-accent/40">
              <CardHeader>
                <CardTitle>{p.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.description}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
