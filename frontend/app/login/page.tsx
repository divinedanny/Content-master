"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/auth";
import { AuthLayout, Field, SubmitButton, FormError, AuthLink } from "@/components/AuthLayout";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await auth.login(email, password);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
      setLoading(false);
    }
  }

  return (
    <AuthLayout
      title="Sign in"
      subtitle="Welcome back to your command centre."
      footer={<>New here? <AuthLink href="/register">Create an account</AuthLink></>}
    >
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
        <Field
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="••••••••"
        />
        <div className="text-right">
          <AuthLink href="/forgot-password">Forgot password?</AuthLink>
        </div>
        <FormError message={error} />
        <SubmitButton loading={loading}>Sign in</SubmitButton>
      </form>
      <div className="mt-4 rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-[11px] leading-relaxed text-slate-500">
        Demo account — <span className="text-slate-300">demo@avionhub.ng</span> /{" "}
        <span className="text-slate-300">demo1234</span>
      </div>
    </AuthLayout>
  );
}
