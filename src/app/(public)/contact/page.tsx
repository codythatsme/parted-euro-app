import { MapPin, Phone, Mail } from "lucide-react";
import { Separator } from "~/components/ui/separator";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "~/components/ui/card";

export default function Contact() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <h1 className="text-4xl font-bold tracking-tight text-foreground sm:text-5xl">
            Contact Us
          </h1>
          {/* <p className="mt-4 text-lg text-muted-foreground">
            We&apos;re here to help with any questions about our parts or
            services
          </p> */}
        </div>

        <Card className="mt-12">
          <CardHeader>
            <CardTitle>Get in Touch</CardTitle>
            {/* <CardDescription>
              Have questions about our parts or services? We&apos;re here to
              help!
            </CardDescription> */}
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center gap-4">
              <MapPin className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium text-foreground">Our Location</p>
                <a
                  href="https://maps.google.com/?q=Unit+2/26+Rushdale+Street,+Knoxfield,+Victoria+Australia"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Unit 2/26 Rushdale Street, Knoxfield, Victoria Australia
                </a>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Phone className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium text-foreground">Phone</p>
                <a
                  className="text-primary hover:underline"
                  href="tel:+61431133764"
                >
                  0431 133 764
                </a>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <Mail className="h-6 w-6 text-primary" />
              <div>
                <p className="font-medium text-foreground">Email</p>
                <a
                  className="text-primary hover:underline"
                  href="mailto:contact@partedeuro.com.au"
                >
                  contact@partedeuro.com.au
                </a>
              </div>
            </div>

            <Separator />

            <div>
              <h3 className="text-lg font-medium text-foreground">
                Business Hours
              </h3>
              <p className="text-muted-foreground">(Via appointment only)</p>
              <div className="mt-4 space-y-2 text-muted-foreground">
                <p>Monday to Friday</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
