import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { AuthCard } from "../_components/auth-card";
import { LoginFormWithNext } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <AuthCard
      title="Welcome back"
      description="Sign in to your account to continue."
      footer={
        <p className="text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-foreground underline-offset-4 hover:underline">
            Sign up
          </Link>
        </p>
      }
    >
      {/* useSearchParams() needs a Suspense boundary for static prerendering. */}
      <Suspense>
        <LoginFormWithNext />
      </Suspense>
    </AuthCard>
  );
}
