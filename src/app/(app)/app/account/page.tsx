import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/require-user";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { ProfileForm } from "./profile-form";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage() {
  const user = await requireUser("/app/account");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .single();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Account</h1>
        <p className="text-muted-foreground">Manage how you appear across the app.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
          <CardDescription>
            Saved to your row in <code className="rounded bg-muted px-1 text-xs">public.profiles</code> —
            RLS ensures you can only ever write your own.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm initialFullName={profile?.full_name ?? ""} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Sign-in email</CardTitle>
          <CardDescription>Your sign-in email is managed by your administrator.</CardDescription>
        </CardHeader>
        <CardContent className="text-sm">
          <span className="font-medium">{user.email}</span>
        </CardContent>
      </Card>
    </div>
  );
}
