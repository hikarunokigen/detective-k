import type { Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.scss";

export const metadata = {
  title: "detective",
  description: "ygosu sleuthing",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body>{children}</body>
    </html>
  );
}
