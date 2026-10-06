import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "../_components/auth-card";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = { title: "Forgot password" };

export default function ForgotPasswordPage() {
  return (
    <AuthCard
      title="Reset your password"
      description="Enter your account email and we'll send you a reset link."
      footer={
        <p className="text-sm text-muted-foreground">
          Remember it now?{" "}
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <ForgotPasswordForm />
    </AuthCard>
  );
}
