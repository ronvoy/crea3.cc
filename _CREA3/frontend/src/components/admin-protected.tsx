import React from "react";
import { Navigate } from "react-router-dom";

function isTokenExpired(token: string): boolean {
  try {
    const [, payloadB64] = token.split(".");
    const payloadJson = atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(payloadJson);
    const exp = typeof payload?.exp === "number" ? payload.exp : 0;
    // exp is in seconds
    return exp > 0 ? Date.now() / 1000 >= exp : false;
  } catch {
    return false;
  }
}

export function AdminProtected({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem("admin_token");
  if (!token) return <Navigate to="/admin" replace />;

  if (isTokenExpired(token)) {
    localStorage.removeItem("admin_token");
    return <Navigate to="/admin" replace />;
  }

  return <>{children}</>;
}
