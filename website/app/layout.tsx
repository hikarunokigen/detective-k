import type { Viewport } from "next";
import { Noto_Sans_KR, Roboto } from "next/font/google";
import type { ReactNode } from "react";

import { Analytics } from "@vercel/analytics/next";

import "./globals.scss";

const roboto = Roboto({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-roboto",
  display: "swap",
});

const notoSansKR = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["400", "500", "700"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

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
    <html
      lang="en"
      className={`${roboto.variable} ${notoSansKR.variable}`}
      style={{ colorScheme: "light" }}
    >
      <body>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
