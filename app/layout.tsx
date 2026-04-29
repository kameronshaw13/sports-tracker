import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Teams",
  description: "Schedule, results, roster, and live games for your favorite teams",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
