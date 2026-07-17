"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Input, toast } from "@fylym/ui";
import { AuthCard } from "@/components/auth-card";
import { useSession } from "@/lib/session";
import { authApi, ApiError } from "@/lib/api-client";
import { safeNext } from "@/lib/safe-next";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const { login } = useSession();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [magicSending, setMagicSending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email, password);
      router.replace(next);
    } catch (err) {
      const message =
        err instanceof ApiError ? err.message : "Could not sign in";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  async function onMagicLink() {
    if (!email) {
      toast.error("Enter your email first");
      return;
    }
    setMagicSending(true);
    try {
      await authApi.requestMagicLink(email);
      toast.success("Check your email for a sign-in link");
    } catch {
      toast.error("Could not send a sign-in link");
    } finally {
      setMagicSending(false);
    }
  }

  return (
    <AuthCard
      title="Sign in"
      description="Welcome back."
      footer={
        <>
          New here?{" "}
          <Link href="/register" className="font-medium text-foreground underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-3" aria-label="Sign in">
        <div className="space-y-1">
          <label htmlFor="email" className="text-sm font-medium">
            Email
          </label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="password" className="text-sm font-medium">
            Password
          </label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <Button type="submit" className="w-full" disabled={submitting}>
          {submitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={onMagicLink}
          disabled={magicSending}
        >
          {magicSending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </div>
    </AuthCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
