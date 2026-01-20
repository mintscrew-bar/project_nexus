import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/Header";
import { Sidebar } from "@/components/layout/Sidebar";

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
    <html lang="ko" suppressHydrationWarning>
      <body className={`${inter.className} font-sans min-h-screen flex flex-col`}>
        <Providers>
          <Header />
          <main className="flex flex-grow">
            <Sidebar />
            <div className="flex-grow overflow-auto bg-bg-primary">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
