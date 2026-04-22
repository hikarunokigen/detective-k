import type { Viewport } from "next";
import type { ReactNode } from "react";

import "./globals.scss";

export const metadata = {
  title: "사이버범죄 조사",
  description: "사이버범죄 조사",
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
        <script
          defer
          src="https://static.cloudflareinsights.com/beacon.min.js"
          data-cf-beacon='{"token":"61bae24806ed4417be1af44bb9334d56"}'
        />
      </body>
    </html>
  );
}
