// apps/web/src/lib/auth.service.ts
import { apiClient, setAccessToken } from "./api-client";
import { useAuthStore } from "@/stores/auth-store";

export const login = async (email: string, password: string) => {
  const { data } = await apiClient.post("/auth/login", { email, password });
  setAccessToken(data.accessToken);
  await fetchAndSetUser();
};

export const logout = async () => {
  try {
    await apiClient.post("/auth/logout");
  } finally {
    useAuthStore.getState().setUser(null);
    setAccessToken(null);
  }
};

export const fetchAndSetUser = async () => {
  try {
    const { data: user } = await apiClient.get("/auth/me");
    useAuthStore.getState().setUser(user);
    return user;
  } catch (error) {
    useAuthStore.getState().setUser(null);
    setAccessToken(null);
    throw new Error("Failed to fetch user");
  }
};

export const handleOAuthCallback = async (token: string) => {
  setAccessToken(token);
  await fetchAndSetUser();
};
