import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Tools Platform",
  description: "Analytics and protocol tools platform"
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
