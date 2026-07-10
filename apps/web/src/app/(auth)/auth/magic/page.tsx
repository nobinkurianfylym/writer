"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { useSession } from "@/lib/session";
import { ApiError } from "@/lib/api-client";

type State = "signing-in" | "error" | "missing";

function MagicConsume() {
  const router = useRouter();
  const params = useSearchParams();
  const token = params.get("token");
  const { loginWithMagicToken } = useSession();
  const [state, setState] = useState<State>(token ? "signing-in" : "missing");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // magic links are single-use — consume exactly once
    loginWithMagicToken(token)
      .then(() => router.replace("/"))
      .catch((err) => {
        setState("error");
        setMessage(
          err instanceof ApiError ? err.message : "This sign-in link is invalid",
        );
      });
  }, [token, loginWithMagicToken, router]);

  const body = {
    "signing-in": "Signing you in…",
    error: message || "This sign-in link is invalid or has expired.",
    missing: "This link is missing its sign-in token.",
  }[state];

  return (
    <AuthCard
      title="Magic sign-in"
      footer={
        state !== "signing-in" ? (
          <Link href="/login" className="font-medium text-foreground underline">
            Back to sign in
          </Link>
        ) : undefined
      }
    >
      <p role="status" className="text-sm text-muted-foreground">
        {body}
      </p>
    </AuthCard>
  );
}

export default function MagicPage() {
  return (
    <Suspense fallback={null}>
      <MagicConsume />
    </Suspense>
  );
}
