"use client";

import { usePersistentTheme } from "@/hooks/usePersistentTheme";
import { Moon, Sun } from "lucide-react"; // Assuming lucide-react is installed for icons

export function ThemeToggle() {
  const { mounted, resolvedTheme, toggleTheme } = usePersistentTheme();

  if (!mounted) {
    return null;
  }

  return (
    <button
      className="flex items-center justify-center p-2 rounded-md hover:bg-bg-tertiary"
      onClick={toggleTheme}
      aria-label="Toggle theme"
    >
      {resolvedTheme === "dark" ? (
        <Sun className="h-5 w-5 text-text-primary" />
      ) : (
        <Moon className="h-5 w-5 text-text-primary" />
      )}
    </button>
  );
}
