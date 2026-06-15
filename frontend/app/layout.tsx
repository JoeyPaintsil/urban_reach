import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "UrbanReach — Business Coverage Analyzer",
  description: "Visualize business drive-time coverage across Lisbon, Portugal",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
