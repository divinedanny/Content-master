"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthLayout, Field, SubmitButton, FormError, AuthLink } from "@/components/AuthLayout";

function ResetInner() {
  const router = useRouter();
  const params = useSearchParams();
  const uid = params.get("uid") || "";
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const linkValid = uid && token;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.confirmReset(uid, token, password);
      router.replace("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reset failed");
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Choose a new password"
      footer={<><AuthLink href="/login">Back to sign in</AuthLink></>}
    >
      {!linkValid ? (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.08] px-4 py-3 text-sm text-amber-200">
          This reset link is missing or invalid. Request a new one from{" "}
          <AuthLink href="/forgot-password">Forgot password</AuthLink>.
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="New password"
            type="password"
            autoComplete="new-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 8 characters"
          />
          <FormError message={error} />
          <SubmitButton loading={loading}>Set new password</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="flex min-h-screen items-center justify-center text-slate-400">Loading…</div>}>
      <ResetInner />
    </Suspense>
  );
}
