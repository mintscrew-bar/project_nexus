"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { statsApi } from "@/lib/api-client";
import { LoadingSpinner } from "@/components/ui";
import type { UserSearchResult } from "./types";

export function UserSearchInput({
  placeholder,
  onSelect,
  disabled,
}: {
  placeholder: string;
  onSelect: (user: UserSearchResult) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await statsApi.searchUsers(val.trim(), 8);
        setResults(data?.users ?? data ?? []);
        setIsOpen(true);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, []);

  function handleSelect(user: UserSearchResult) {
    onSelect(user);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }

  return (
    <div className="relative">
      <input
        value={query}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="w-full rounded-xl border border-white/10 bg-bg-primary/70 px-3 py-2 text-sm text-text-primary outline-none placeholder:text-text-tertiary disabled:opacity-50"
      />
      {searching && (
        <div className="absolute right-2 top-2.5">
          <LoadingSpinner className="h-4 w-4" />
        </div>
      )}
      {isOpen && results.length > 0 && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-white/10 bg-bg-secondary shadow-lg">
          {results.map((u) => (
            <button
              key={u.userId}
              type="button"
              onClick={() => handleSelect(u)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-text-primary hover:bg-bg-elevated"
            >
              {u.avatar ? (
                <Image
                  src={u.avatar}
                  alt={u.username}
                  width={24}
                  height={24}
                  className="h-6 w-6 rounded-full object-cover"
                  unoptimized
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-bg-tertiary" />
              )}
              {u.username}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function UserChip({
  user,
  onRemove,
  linkable,
}: {
  user: UserSearchResult;
  onRemove: () => void;
  linkable?: boolean;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-bg-primary/60 px-2 py-1">
      {user.avatar ? (
        <Image
          src={user.avatar}
          alt={user.username}
          width={20}
          height={20}
          className="h-5 w-5 rounded-full object-cover"
          unoptimized
        />
      ) : (
        <div className="h-5 w-5 rounded-full bg-bg-tertiary" />
      )}
      {linkable ? (
        <Link href={`/users/${user.userId}`} className="text-xs font-semibold text-accent-primary hover:underline">
          {user.username}
        </Link>
      ) : (
        <span className="text-xs font-semibold text-text-primary">{user.username}</span>
      )}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 text-text-tertiary hover:text-accent-danger"
        aria-label="제거"
      >
        ×
      </button>
    </div>
  );
}
