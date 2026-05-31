import type { Metadata } from "next";
import { BrandingProvider } from "@/components/providers/BrandingProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Avidity IT Management Tool",
  description: "Modular IT management platform"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <BrandingProvider>{children}</BrandingProvider>
      </body>
    </html>
  );
}
