import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/roles";
import { createClient } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

import { InviteForm } from "./invite-form";

export const metadata: Metadata = { title: "Settings" };

/**
 * Admin-only settings (IMPLEMENTATION-PLAN.md Phase 1).
 * Warehouse/support users hitting /settings are redirected to /dashboard
 * by requireRole — they never see this page or the nav entry.
 */
export default async function SettingsPage() {
  await requireRole("admin", "/settings");

  const supabase = await createClient();
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("user_id, role, granted_at")
    .order("granted_at", { ascending: true });

  const staffIds = (roleRows ?? []).map((row) => row.user_id);
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, email")
    .in("id", staffIds.length > 0 ? staffIds : ["00000000-0000-0000-0000-000000000000"]);

  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const staff = (roleRows ?? []).map((row) => ({
    ...row,
    profile: profileById.get(row.user_id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Staff access and store settings. Admins only.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Invite staff</CardTitle>
          <CardDescription>
            Sends a sign-in invite and grants the chosen role up front, so the account works on
            first sign-in.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <InviteForm />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff</CardTitle>
          <CardDescription>Everyone with access to this Stockroom workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {staff.map((member) => (
                <TableRow key={member.user_id}>
                  <TableCell className="font-medium">{member.profile?.full_name ?? "—"}</TableCell>
                  <TableCell>{member.profile?.email ?? "—"}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {member.role}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
