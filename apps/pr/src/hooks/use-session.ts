"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

/**
 * Mock authentication. There is no backend: signing in/up simply records the
 * user locally so the app shell can greet them and guard its pages. Swapping
 * this for Supabase later only changes this store's actions.
 */
interface SessionState {
  user: { name: string; email: string } | null;
  /** True once the persisted session has been read back from storage — the
   * auth guard must not redirect before this, or a hard refresh while
   * signed in would bounce through /signin. */
  hydrated: boolean;
  signIn: (email: string) => void;
  signUp: (name: string, email: string) => void;
  signOut: () => void;
}

export const useSession = create<SessionState>()(
  persist(
    (set) => ({
      user: null,
      hydrated: false,
      signIn: (email) =>
        set({ user: { name: email.split("@")[0] ?? "Producer", email } }),
      signUp: (name, email) => set({ user: { name, email } }),
      signOut: () => set({ user: null }),
    }),
    {
      name: "pr-fylym-session",
      partialize: (s) => ({ user: s.user }),
      onRehydrateStorage: () => () => {
        useSession.setState({ hydrated: true });
      },
    },
  ),
);
