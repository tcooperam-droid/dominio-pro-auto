import { describe, expect, it } from "vitest";
import { sameIdentity } from "./AuthGate";
import type { Session } from "@supabase/supabase-js";

const session = (id: string, email: string): Session => ({
  access_token: "token",
  refresh_token: "refresh",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  token_type: "bearer",
  user: {
    id,
    aud: "authenticated",
    role: "authenticated",
    email,
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-01-01T00:00:00.000Z",
  },
});

describe("AuthGate session identity", () => {
  it("considera a mesma identidade quando o token é renovado", () => {
    expect(sameIdentity(session("user-1", "Owner@Example.com"), session("user-1", "owner@example.com"))).toBe(true);
  });

  it("não reutiliza autorização para outro usuário", () => {
    expect(sameIdentity(session("user-1", "owner@example.com"), session("user-2", "owner@example.com"))).toBe(false);
  });
});
