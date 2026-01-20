import type { Metadata } from "next";
import { Inter } from "next/font/google";
// import localFont from "next/font/local"; // Removed localFont import
import "./globals.css";
import { Providers } from "./providers";
import { Logo } from "@/components/Logo";
import Link from "next/link";
// import { NavBar } from "@/components/NavBar"; // Remove old NavBar import
import { ThemeToggle } from "@/components/ThemeToggle"; // Import ThemeToggle

const inter = Inter({ subsets: ["latin"] });

// Define local fonts (Placeholder paths - adjust as needed) - REMOVED AS PER DESIGN SYSTEM
// const beaufort = localFont({
//   src: "../assets/fonts/BeaufortforLOL-Regular.woff2",
//   variable: "--font-beaufort",
//   display: "swap",
// });

// const spiegel = localFont({
//   src: "../assets/fonts/Spiegel-Regular.woff2",
//   variable: "--font-spiegel",
//   display: "swap",
// });


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
    <html lang="ko"> {/* Removed font variables from html tag */}
      <body className={`${inter.className} font-sans min-h-screen flex flex-col`}>
        <Providers>
          {/* Header */}
          <header className="bg-bg-secondary border-b border-bg-tertiary p-4 flex justify-between items-center z-10 sticky top-0">
            <Link href="/" className="flex items-center">
              <Logo className="h-8 w-auto" />
              <span className="ml-2 text-xl font-bold text-text-primary hidden sm:block">Nexus</span>
            </Link>
            <nav className="flex-grow flex justify-center">
              {/* Main Nav Links - Placeholder for now, will be detailed later */}
              <ul className="flex space-x-6 text-text-secondary">
                <li><Link href="/tournaments" className="hover:text-text-primary">내전</Link></li>
                <li><Link href="/matches" className="hover:text-text-primary">내전 전적</Link></li>
                <li><Link href="/clans" className="hover:text-text-primary">클랜</Link></li>
                <li><Link href="/community" className="hover:text-text-primary">커뮤니티</Link></li>
              </ul>
            </nav>
            <div className="flex items-center space-x-4">
              <ThemeToggle />
              {/* Auth Button or User Avatar - Placeholder for now */}
              <Link href="/auth/login" className="px-6 py-2.5 bg-accent-primary hover:bg-accent-hover active:bg-accent-active text-white font-medium rounded-lg transition-colors duration-150 text-sm">로그인</Link>
            </div>
          </header>

          {/* Main Content Area */}
          <main className="flex flex-grow">
            {/* Left Sidebar - Placeholder for now */}
            <aside className="w-64 bg-bg-secondary border-r border-bg-tertiary p-4 hidden md:block">
              <h2 className="text-lg font-semibold mb-4 text-text-primary">메뉴</h2>
              <ul className="space-y-2 text-text-secondary">
                <li><Link href="/dashboard" className="block hover:text-text-primary">대시보드</Link></li>
                <li><Link href="/friends" className="block hover:text-text-primary">친구</Link></li>
                <li><Link href="/settings" className="block hover:text-text-primary">설정</Link></li>
              </ul>
            </aside>

            <div className="flex-grow overflow-auto bg-bg-primary">
              {children}
            </div>
          </main>
        </Providers>
      </body>
    </html>
  );
}
