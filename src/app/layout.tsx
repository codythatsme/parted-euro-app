import "~/styles/globals.css";

import { GeistSans } from "geist/font/sans";
import { type Metadata } from "next";

import { TRPCReactProvider } from "~/trpc/react";
import { NuqsAdapter } from "nuqs/adapters/next";
import { Toaster } from "~/components/ui/sonner";
import { CartUIProvider } from "~/components/cart-provider";

export const metadata: Metadata = {
  title: "Parted Euro",
  description: "BMW Wrecking/Spares/Parts",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${GeistSans.variable}`}
      suppressHydrationWarning
    >
      {process.env.NODE_ENV === "development" && (
        <head>
          <script
            async
            crossOrigin="anonymous"
            src="//unpkg.com/react-scan/dist/auto.global.js"
          />
        </head>
      )}
      <body>
        <TRPCReactProvider>
          <CartUIProvider>
            <NuqsAdapter>{children}</NuqsAdapter>
          </CartUIProvider>
        </TRPCReactProvider>
        <Toaster richColors />
      </body>
    </html>
  );
}
