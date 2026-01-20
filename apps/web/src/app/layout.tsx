import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "./providers";
import { Logo } from "@/components/Logo";
import Link from "next/link";
// import { NavBar } from "@/components/NavBar"; // Remove old NavBar import
import { ThemeToggle } from "@/components/ThemeToggle"; // Import ThemeToggle

const inter = Inter({ subsets: ["latin"] });

// Define local fonts (Placeholder paths - adjust as needed)
const beaufort = localFont({
  src: "../assets/fonts/BeaufortforLOL-Regular.woff2",
  variable: "--font-beaufort",
  display: "swap",
});

const spiegel = localFont({
  src: "../assets/fonts/Spiegel-Regular.woff2",
  variable: "--font-spiegel",
  display: "swap",
});


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
    <html lang="ko" className={`${beaufort.variable} ${spiegel.variable}`}>
      <body className={`${inter.className} font-sans min-h-screen flex flex-col`}>
        <Providers>
          {/* Header */}
          <header className="bg-ui-card border-b border-ui-border p-4 flex justify-between items-center z-10 sticky top-0">
            <Link href="/" className="flex items-center">
              <Logo className="h-8 w-auto" />
              <span className="ml-2 text-xl font-bold text-ui-text-base hidden sm:block">Nexus</span>
            </Link>
            <nav className="flex-grow flex justify-center">
              {/* Main Nav Links - Placeholder for now, will be detailed later */}
              <ul className="flex space-x-6 text-ui-text-muted">
                <li><Link href="/tournaments" className="hover:text-ui-text-base">내전</Link></li>
                <li><Link href="/matches" className="hover:text-ui-text-base">내전 전적</Link></li>
                <li><Link href="/clans" className="hover:text-ui-text-base">클랜</Link></li>
                <li><Link href="/community" className="hover:text-ui-text-base">커뮤니티</Link></li>
              </ul>
            </nav>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              {/* Auth Button or User Avatar - Placeholder for now */}
              <Link href="/auth/login" className="btn-primary text-sm px-4 py-2">로그인</Link>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex flex-grow">
            {/* Left Sidebar - Placeholder for now */}
            <aside className="w-64 bg-ui-card border-r border-ui-border p-4 hidden md:block">
              <h2 className="text-lg font-semibold mb-4 text-ui-text-base">메뉴</h2>
              <ul className="space-y-2 text-ui-text-muted">
                <li><Link href="/dashboard" className="block hover:text-ui-text-base">대시보드</Link></li>
                <li><Link href="/friends" className="block hover:text-ui-text-base">친구</Link></li>
                <li><Link href="/settings" className="block hover:text-ui-text-base">설정</Link></li>
              </ul>
            </aside>

            <div className="flex-grow overflow-auto">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
