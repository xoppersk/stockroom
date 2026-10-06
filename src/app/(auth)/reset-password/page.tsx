import type { Metadata } from "next";
import Link from "next/link";

import { AuthCard } from "../_components/auth-card";
import { ResetPasswordForm } from "./reset-password-form";

export const metadata: Metadata = { title: "Set a new password" };

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="Choose a new password"
      description="Enter and confirm your new password below."
      footer={
        <p className="text-sm text-muted-foreground">
          <Link href="/login" className="text-foreground underline-offset-4 hover:underline">
            Back to sign in
          </Link>
        </p>
      }
    >
      <ResetPasswordForm />
    </AuthCard>
  );
}
