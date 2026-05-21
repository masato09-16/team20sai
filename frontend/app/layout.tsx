import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "板書上達支援",
  description: "黒板の書き方を画像解析でフィードバック",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}
