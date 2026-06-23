import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tools Platform",
  description: "Analytics and protocol tools platform",
  manifest: "/manifest.json",
  // Use the brand logo as the favicon so the browser stops requesting a
  // non-existent /favicon.ico (which 404s).
  icons: {
    icon: "/logo.png",
    shortcut: "/logo.png",
    apple: "/logo.png"
  }
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
