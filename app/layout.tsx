import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "SpeakAd.ai — Talking Actors",
  description: "Generate UGC-style talking actor videos from a script.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
