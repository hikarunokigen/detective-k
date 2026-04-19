import type { ReactNode } from "react";

import "./globals.scss";

export const metadata = {
  title: "detective_k",
  description: "ygosu sleuthing",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" style={{ colorScheme: "light" }}>
      <body>{children}</body>
    </html>
  );
}
