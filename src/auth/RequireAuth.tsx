import { Navigate } from "react-router-dom";
import type { ReactElement } from "react";
import { useAuth } from "./AuthContext";

export function RequireAuth({ children }: { children: ReactElement }) {
  const { token } = useAuth();
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return children;
}
