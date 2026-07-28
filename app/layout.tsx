import { Inter } from "next/font/google";
import type { Metadata } from "next";
import "./globals.css";
import { cn } from "@/lib/utils";

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = {
  title: "Greenscape Pro — Proposal Agent",
  description:
    "Turn site-walk notes into priced proposal drafts for founder approval.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("antialiased font-sans", inter.variable)}>
      <body>{children}</body>
    </html>
  );
}
