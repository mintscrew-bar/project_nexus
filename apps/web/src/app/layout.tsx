import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Project Nexus - LoL In-House Tournament",
  description: "League of Legends 내전 토너먼트 플랫폼",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko">
      <body className={`${inter.className} bg-dark-500 text-white min-h-screen`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
