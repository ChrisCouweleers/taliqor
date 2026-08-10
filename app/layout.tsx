import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Taliqor — Revenue, reconciled.",
  description: "Reconcile revenue across every source with confidence.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
