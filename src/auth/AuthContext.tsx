import { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { apiRequest, api, clearAuth, getToken, loadUser, saveAuth } from "../api/client";
import type { User, LoginResponse } from "../api/types";

interface AuthContextValue {
  token: string | null;
  user: User | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  register: (email: string, password: string, displayName: string, role: "USER" | "COACH") => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<User | null>(() => loadUser());

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    saveAuth(res.access_token, res.user);
    setToken(res.access_token);
    setUser(res.user);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName: string, role: "USER" | "COACH") => {
    const res = await apiRequest<LoginResponse>("/auth/register", {method: "POST", auth: false, body: {email, password, display_name: displayName, role}});
    saveAuth(res.access_token, res.user); setToken(res.access_token); setUser(res.user);
  }, []);

  const logout = useCallback(() => {
    clearAuth();
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ token, user, login, logout, register }),
    [token, user, login, logout, register],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth 必须在 AuthProvider 内使用");
  return ctx;
}
