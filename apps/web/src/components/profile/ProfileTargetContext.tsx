"use client";

import { createContext, useContext, type ReactNode } from "react";

interface ProfileTarget {
  userId: string;
  isOwnProfile: boolean;
}

const ProfileTargetContext = createContext<ProfileTarget | null>(null);

export function ProfileTargetProvider({
  userId,
  isOwnProfile,
  children,
}: ProfileTarget & { children: ReactNode }) {
  return (
    <ProfileTargetContext.Provider value={{ userId, isOwnProfile }}>
      {children}
    </ProfileTargetContext.Provider>
  );
}

export function useProfileTarget(): ProfileTarget | null {
  return useContext(ProfileTargetContext);
}
