import type { Metadata } from "next";

import { portalConfig } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: `Client Portal | ${portalConfig.brand.name}`,
  description: "Private project workspace.",
  // A client portal has no business in a search index.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
