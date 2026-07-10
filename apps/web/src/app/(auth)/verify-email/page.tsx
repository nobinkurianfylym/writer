"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AuthCard } from "@/components/auth-card";
import { authApi, ApiError } from "@/lib/api-client";

type State = "verifying" | "success" | "error" | "missing";

function VerifyEmail() {
  const params = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>(token ? "verifying" : "missing");
  const [message, setMessage] = useState("");
  const ran = useRef(false);

  useEffect(() => {
    if (!token || ran.current) return;
    ran.current = true; // verification is single-use; never fire twice
    authApi
      .verifyEmail(token)
      .then(() => setState("success"))
      .catch((err) => {
        setState("error");
        setMessage(
          err instanceof ApiError ? err.message : "Verification failed",
        );
      });
  }, [token]);

  const body = {
    verifying: "Verifying your email…",
    success: "Your email is verified. You're all set.",
    error: message || "This verification link is invalid or expired.",
    missing: "This link is missing its verification token.",
  }[state];

  return (
    <AuthCard
      title="Verify email"
      footer={
        <Link href="/login" className="font-medium text-foreground underline">
          Continue to sign in
        </Link>
      }
    >
      <p role="status" className="text-sm text-muted-foreground">
        {body}
      </p>
    </AuthCard>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={null}>
      <VerifyEmail />
    </Suspense>
  );
}
