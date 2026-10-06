import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "../_components/auth-card";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = { title: "Sign up" };

export default function SignupPage() {
  return (
    <AuthCard
      title="Create your account"
      description="Start with email and password, or go passwordless."
      footer={
        <p className="text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      }
    >
      <SignupForm />
    </AuthCard>
  );
}
