import type { Metadata } from "next";
import { DM_Sans, Manrope } from "next/font/google";
import "./globals.css";
import "./close.css";

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});
const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

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
    <html lang="en" className={`${dmSans.variable} ${manrope.variable}`}>
      <body>{children}</body>
    </html>
  );
}
