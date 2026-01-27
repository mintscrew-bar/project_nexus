// apps/web/src/lib/auth.service.ts
import apiClient from "./api-client";
import { useAuthStore } from "@/stores/auth-store";

export const login = async (email, password) => {
  const { data } = await apiClient.post("/auth/login", { email, password });
  useAuthStore.getState().setTokens(data.accessToken, null); // We don't get refresh token here
  await fetchAndSetUser();
};

export const logout = async () => {
  try {
    await apiClient.post("/auth/logout");
  } finally {
    useAuthStore.getState().clearAuth();
    // Also consider clearing any cookies if set from client-side, though backend handles it
  }
};

export const fetchAndSetUser = async () => {
  try {
    const { data: user } = await apiClient.get("/auth/me");
    useAuthStore.getState().setUser(user);
    return user;
  } catch (error) {
    // This might fail if the token is expired, so we clear auth state
    useAuthStore.getState().clearAuth();
    throw new Error("Failed to fetch user");
  }
};

export const handleOAuthCallback = async (token: string) => {
  useAuthStore.getState().setTokens(token, null);
  await fetchAndSetUser();
};
