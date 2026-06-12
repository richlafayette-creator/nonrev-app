import type { Metadata, Viewport } from "next";
import { Bungee, Geist, Geist_Mono } from "next/font/google";
import AppNavigation from "./AppNavigation";
import PWAInstallScaffold from "./PWAInstallScaffold";
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
  applicationName: "nonrevy",
  title: "nonrevy",
  description: "Nonrev flight search and itinerary planning",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "nonrevy",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icons/nonrevy-icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/icons/apple-touch-icon.png", sizes: "500x500", type: "image/png" },
    ],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
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
        <AppNavigation />
        {children}
        <PWAInstallScaffold />
      </body>
    </html>
  );
}
