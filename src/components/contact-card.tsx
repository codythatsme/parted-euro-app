import { Clock, Mail, MapPin, Phone, Route } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

export type ContactCardData = {
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

function buildMapEmbedUrl(address: string): string {
  return `https://www.google.com/maps?q=${encodeURIComponent(address)}&output=embed`;
}

export function ContactCard({ data }: { data: ContactCardData }) {
  return (
    <div className="space-y-10">
      <Hero
        heading={data.heading}
        cardTitle={data.cardTitle}
        imageUrl={data.heroImageUrl}
      />

      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="xl:col-span-2">
          <CardContent className="space-y-6 pt-6">
            <InfoRow icon={MapPin} label="Our Location">
              {data.mapsUrl ? (
                <a
                  href={data.mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="break-words text-primary hover:underline"
                >
                  {data.address}
                </a>
              ) : (
                <span className="break-words text-muted-foreground">
                  {data.address}
                </span>
              )}
            </InfoRow>

            <InfoRow icon={Phone} label="Phone">
              {data.phoneHref ? (
                <a
                  className="text-primary hover:underline"
                  href={data.phoneHref}
                >
                  {data.phoneDisplay}
                </a>
              ) : (
                <span className="text-muted-foreground">
                  {data.phoneDisplay}
                </span>
              )}
            </InfoRow>

            <InfoRow icon={Mail} label="Email">
              {data.email ? (
                <a
                  className="break-words text-primary hover:underline"
                  href={`mailto:${data.email}`}
                >
                  {data.email}
                </a>
              ) : null}
            </InfoRow>

            <QuickActions
              phoneHref={data.phoneHref}
              email={data.email}
              mapsUrl={data.mapsUrl}
            />

            <Separator />

            <BusinessHours
              title={data.businessHoursTitle}
              note={data.businessHoursNote}
              lines={data.businessHoursLines}
            />
          </CardContent>
        </Card>

        <div className="overflow-hidden rounded-xl border bg-muted shadow-sm xl:col-span-3">
          {data.address ? (
            <iframe
              title="Map"
              src={buildMapEmbedUrl(data.address)}
              className="h-[420px] w-full xl:h-full xl:min-h-[520px]"
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
            />
          ) : (
            <div className="flex h-[420px] w-full items-center justify-center text-muted-foreground xl:h-full xl:min-h-[520px]">
              Add an address to show the map
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Hero({
  heading,
  cardTitle,
  imageUrl,
}: {
  heading: string;
  cardTitle: string;
  imageUrl: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl border shadow-sm">
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-[260px] w-full object-cover sm:h-[320px] md:h-[380px]"
        />
      ) : (
        <div className="h-[260px] w-full bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900 sm:h-[320px] md:h-[380px]" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-black/20" />
      <div className="absolute inset-0 flex flex-col justify-end p-6 sm:p-10">
        <h1 className="text-4xl font-bold tracking-tight text-white sm:text-5xl">
          {heading || " "}
        </h1>
        {cardTitle && (
          <p className="mt-3 max-w-2xl text-base text-white/85 sm:text-lg">
            {cardTitle}
          </p>
        )}
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof MapPin;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-4">
      <div className="rounded-lg bg-primary/10 p-2.5 text-primary">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-foreground">{label}</p>
        <div className="mt-0.5 text-sm">{children}</div>
      </div>
    </div>
  );
}

function QuickActions({
  phoneHref,
  email,
  mapsUrl,
}: {
  phoneHref: string;
  email: string;
  mapsUrl: string;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {phoneHref ? (
        <Button asChild variant="default">
          <a href={phoneHref}>
            <Phone className="mr-2 h-4 w-4" /> Call
          </a>
        </Button>
      ) : (
        <Button variant="default" disabled>
          <Phone className="mr-2 h-4 w-4" /> Call
        </Button>
      )}
      {email ? (
        <Button asChild variant="outline">
          <a href={`mailto:${email}`}>
            <Mail className="mr-2 h-4 w-4" /> Email
          </a>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          <Mail className="mr-2 h-4 w-4" /> Email
        </Button>
      )}
      {mapsUrl ? (
        <Button asChild variant="outline">
          <a href={mapsUrl} target="_blank" rel="noopener noreferrer">
            <Route className="mr-2 h-4 w-4" /> Directions
          </a>
        </Button>
      ) : (
        <Button variant="outline" disabled>
          <Route className="mr-2 h-4 w-4" /> Directions
        </Button>
      )}
    </div>
  );
}

function BusinessHours({
  title,
  note,
  lines,
}: {
  title: string;
  note: string | null;
  lines: string[];
}) {
  return (
    <div>
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-primary" />
        <h3 className="text-lg font-medium text-foreground">{title || " "}</h3>
      </div>
      {note && <p className="mt-1 text-sm text-muted-foreground">{note}</p>}
      {lines.length > 0 && (
        <ul className="mt-3 space-y-1.5 text-sm text-muted-foreground">
          {lines.map((line, i) => (
            <li key={i} className="flex items-start">
              <span className="mr-2 mt-2 h-1 w-1 shrink-0 rounded-full bg-primary/60" />
              {line}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
