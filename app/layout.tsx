import type { Metadata } from "next";
import "./globals.css";
import "./close.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://taliqor.com"),
  title: "Taliqor — Revenue, reconciled.",
  description: "Reconcile revenue across every source with confidence.",
  applicationName: "Taliqor",
  openGraph: {
    title: "Taliqor — Revenue, reconciled.",
    description: "Close the gaps. Then close the books.",
    type: "website",
    images: [{ url: "/brand/taliqor-social-card.svg", width: 1200, height: 630, alt: "Taliqor — Revenue, reconciled." }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
