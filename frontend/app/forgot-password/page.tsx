"use client";

import { useState } from "react";
import Link from "next/link";
import { auth } from "@/lib/auth";
import { AuthLayout, Field, SubmitButton, FormError, AuthLink } from "@/components/AuthLayout";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [debugLink, setDebugLink] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await auth.requestReset(email);
      setSent(true);
      // In demo tiers the backend returns the link so it's testable without SMTP.
      if (res.debug_reset_link) setDebugLink(res.debug_reset_link);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We'll send a reset link to your email."
      footer={<>Remembered it? <AuthLink href="/login">Back to sign in</AuthLink></>}
    >
      {sent ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-500/25 bg-emerald-500/[0.08] px-4 py-3 text-sm text-emerald-200">
            If that email exists, a reset link is on its way.
          </div>
          {debugLink && (
            <div className="rounded-xl bg-white/[0.03] p-3 text-xs text-slate-400">
              <div className="mb-1 font-medium text-slate-300">Demo mode — no email server:</div>
              <Link href={debugLink.replace(/^https?:\/\/[^/]+/, "")} className="break-all text-accent-soft hover:text-white">
                {debugLink}
              </Link>
            </div>
          )}
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field
            label="Email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@business.com"
          />
          <FormError message={error} />
          <SubmitButton loading={loading}>Send reset link</SubmitButton>
        </form>
      )}
    </AuthLayout>
  );
}
