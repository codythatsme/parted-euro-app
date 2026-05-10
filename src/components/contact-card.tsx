import { Mail, MapPin, Phone } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";

export type ContactCardData = {
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

export function ContactCard({ data }: { data: ContactCardData }) {
  return (
    <div>
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
          {data.heading || " "}
        </h1>
      </div>
      <Card className="mt-12">
        <CardHeader>
          <CardTitle>{data.cardTitle || " "}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <MapPin className="h-6 w-6 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">Our Location</p>
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
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Phone className="h-6 w-6 text-primary" />
            <div>
              <p className="font-medium text-foreground">Phone</p>
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
            </div>
          </div>

          <div className="flex items-center gap-4">
            <Mail className="h-6 w-6 text-primary" />
            <div className="min-w-0 flex-1">
              <p className="font-medium text-foreground">Email</p>
              {data.email ? (
                <a
                  className="break-words text-primary hover:underline"
                  href={`mailto:${data.email}`}
                >
                  {data.email}
                </a>
              ) : null}
            </div>
          </div>

          <Separator />

          <div>
            <h3 className="text-lg font-medium text-foreground">
              {data.businessHoursTitle || " "}
            </h3>
            {data.businessHoursNote && (
              <p className="text-muted-foreground">{data.businessHoursNote}</p>
            )}
            {data.businessHoursLines.length > 0 && (
              <div className="mt-4 space-y-2 text-muted-foreground">
                {data.businessHoursLines.map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
