import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "ShipReadme",
  description: "README diagnosis and repair tool for open-source projects."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
