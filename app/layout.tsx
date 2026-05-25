import type { Metadata } from "next";
import { Bungee, Geist, Geist_Mono } from "next/font/google";
import AccountMenu from "./AccountMenu";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const bungee = Bungee({
  variable: "--font-brooklyn-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "nonrevy",
  description: "Nonrev flight search and itinerary planning",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${bungee.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <AccountMenu />
        {children}
      </body>
    </html>
  );
}
