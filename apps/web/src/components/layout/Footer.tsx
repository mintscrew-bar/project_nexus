import Link from 'next/link';

export function Footer() {
  return (
    <footer className="bg-bg-secondary border-t border-bg-tertiary px-6 py-4">
      <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-text-tertiary">
        <p>&copy; {new Date().getFullYear()} Project Nexus</p>
        <nav className="flex gap-4">
          <Link href="/community" className="hover:text-text-secondary transition-colors duration-150">
            커뮤니티
          </Link>
          <Link href="/privacy" className="hover:text-text-secondary transition-colors duration-150">
            개인정보처리방침
          </Link>
          <Link href="/terms" className="hover:text-text-secondary transition-colors duration-150">
            이용약관
          </Link>
        </nav>
      </div>
    </footer>
  );
}
