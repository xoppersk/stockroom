"use client";

import { useState, type FormEvent } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { inviteStaffMember } from "./actions";

/** Admin-only form: invite a staff member by email + role. */
export function InviteForm() {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("warehouse");
  const [status, setStatus] = useState<{ kind: "error" | "success"; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setStatus(null);

    const formData = new FormData(event.currentTarget);
    formData.set("role", role);
    const result = await inviteStaffMember(formData);

    setPending(false);
    if (result.ok) {
      setEmail("");
      setStatus({ kind: "success", message: `Invite sent to ${result.email}.` });
    } else {
      setStatus({ kind: "error", message: result.error });
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-md flex-col gap-4">
      <div className="grid gap-2">
        <Label htmlFor="invite-email">Email</Label>
        <Input
          id="invite-email"
          name="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="teammate@example.com"
        />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="invite-role">Role</Label>
        <Select value={role} onValueChange={setRole}>
          <SelectTrigger id="invite-role">
            <SelectValue placeholder="Pick a role" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="admin">Admin — full access</SelectItem>
            <SelectItem value="warehouse">Warehouse — orders & inventory</SelectItem>
            <SelectItem value="support">Support — customers & orders</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        Send invite
      </Button>
      {status ? (
        <p
          role={status.kind === "error" ? "alert" : "status"}
          className={
            status.kind === "error" ? "text-sm text-destructive" : "text-sm text-muted-foreground"
          }
        >
          {status.message}
        </p>
      ) : null}
    </form>
  );
}
