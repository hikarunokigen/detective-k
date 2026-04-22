import type { Viewport } from "next";
import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";

import "./globals.scss";

export const metadata = {
  title: "케이 커뮤니티 사이버 범죄 조사",
  description: "케이 커뮤니티 사이버 범죄 조사",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
