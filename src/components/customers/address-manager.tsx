"use client";

import { useActionState, useState } from "react";
import { MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/app/empty-state";
import {
  addAddress,
  deleteAddress,
  setDefaultAddress,
  updateAddress,
} from "@/lib/customers/actions";
import type { ActionState } from "@/lib/server-action";
import { cn } from "@/lib/utils";

export interface AddressRecord {
  id: string;
  label: string;
  line1: string;
  line2: string | null;
  city: string;
  region: string;
  postal_code: string;
  country: string;
  is_default: boolean;
}

function AddressFormFields({
  address,
  state,
}: {
  address?: AddressRecord;
  state: ActionState;
}) {
  const err = (name: string) => state.fieldErrors?.[name]?.[0];
  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="addr-label">Label</Label>
          <select
            id="addr-label"
            name="label"
            defaultValue={address?.label ?? "shipping"}
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          >
            <option value="shipping">Shipping</option>
            <option value="billing">Billing</option>
            <option value="home">Home</option>
            <option value="work">Work</option>
          </select>
          {err("label") ? <p className="text-sm text-destructive">{err("label")}</p> : null}
        </div>
        <div className="flex items-end gap-2 pb-1">
          <input
            type="checkbox"
            id="addr-default"
            name="is_default"
            defaultChecked={address?.is_default ?? false}
            className="size-4 accent-[#d97706]"
          />
          <Label htmlFor="addr-default" className="pb-0.5">
            Default address
          </Label>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="addr-line1">Street address</Label>
        <Input
          id="addr-line1"
          name="line1"
          defaultValue={address?.line1 ?? ""}
          placeholder="3900 City Ave"
        />
        {err("line1") ? <p className="text-sm text-destructive">{err("line1")}</p> : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="addr-line2">Apt / suite (optional)</Label>
        <Input
          id="addr-line2"
          name="line2"
          defaultValue={address?.line2 ?? ""}
          placeholder="Apt 4B"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="addr-city">City</Label>
          <Input id="addr-city" name="city" defaultValue={address?.city ?? ""} placeholder="Philadelphia" />
          {err("city") ? <p className="text-sm text-destructive">{err("city")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addr-region">State / region</Label>
          <Input id="addr-region" name="region" defaultValue={address?.region ?? ""} placeholder="PA" />
          {err("region") ? <p className="text-sm text-destructive">{err("region")}</p> : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="addr-postal">Postal code</Label>
          <Input id="addr-postal" name="postal_code" defaultValue={address?.postal_code ?? ""} placeholder="19131" />
          {err("postal_code") ? <p className="text-sm text-destructive">{err("postal_code")}</p> : null}
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="addr-country">Country</Label>
        <Input id="addr-country" name="country" defaultValue={address?.country ?? "US"} />
        {err("country") ? <p className="text-sm text-destructive">{err("country")}</p> : null}
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </div>
  );
}

function AddressDialog({
  customerId,
  address,
  trigger,
  onDone,
}: {
  customerId: string;
  address?: AddressRecord;
  trigger: React.ReactNode;
  onDone: () => void;
}) {
  const [open, setOpen] = useState(false);
  const action = address ? updateAddress : addAddress;
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    async (prev, fd) => {
      const result = await action(prev, fd);
      if (result.ok) {
        setOpen(false);
        onDone();
      }
      return result;
    },
    { ok: false },
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{address ? "Edit address" : "Add address"}</DialogTitle>
          <DialogDescription>
            {address ? "Update this saved address." : "Save a new shipping or billing address."}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-5">
          <input type="hidden" name="customer_id" value={customerId} />
          {address ? <input type="hidden" name="id" value={address.id} /> : null}
          <AddressFormFields address={address} state={state} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : address ? "Save changes" : "Add address"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Address manager: saved addresses with default marking, add/edit dialogs,
 * and delete. All mutations run through the customers server actions.
 */
export function AddressManager({
  customerId,
  addresses,
}: {
  customerId: string;
  addresses: AddressRecord[];
}) {
  const [list, setList] = useState(addresses);

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this address?")) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("customer_id", customerId);
    const result = await deleteAddress({ ok: false }, fd);
    if (result.ok) {
      setList(list.filter((a) => a.id !== id));
    } else {
      window.alert(result.error ?? "Couldn't delete the address.");
    }
  }

  async function handleSetDefault(id: string) {
    const fd = new FormData();
    fd.set("id", id);
    fd.set("customer_id", customerId);
    const result = await setDefaultAddress({ ok: false }, fd);
    if (result.ok) {
      setList(list.map((a) => ({ ...a, is_default: a.id === id })));
    } else {
      window.alert(result.error ?? "Couldn't update the default address.");
    }
  }

  if (list.length === 0) {
    return (
      <div className="space-y-4">
        <EmptyState
          icon={MapPin}
          title="No addresses saved"
          description="Add a shipping or billing address so orders can be placed for this customer."
        />
        <AddressDialog
          customerId={customerId}
          onDone={() => window.location.reload()}
          trigger={
            <Button variant="outline">
              <Plus className="size-4" /> Add address
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <ul className="grid gap-3 sm:grid-cols-2">
        {list.map((address) => (
          <li
            key={address.id}
            className={cn(
              "rounded-lg border p-4",
              address.is_default && "border-primary/60 bg-primary/5",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium capitalize">{address.label}</span>
                {address.is_default ? (
                  <Badge variant="default" className="gap-1">
                    <Star className="size-3" /> Default
                  </Badge>
                ) : null}
              </div>
              <div className="flex gap-1">
                {!address.is_default ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSetDefault(address.id)}
                    title="Set as default"
                  >
                    <Star className="size-4" />
                    <span className="sr-only">Set as default</span>
                  </Button>
                ) : null}
                <AddressDialog
                  customerId={customerId}
                  address={address}
                  onDone={() => window.location.reload()}
                  trigger={
                    <Button variant="ghost" size="sm" title="Edit address">
                      <Pencil className="size-4" />
                      <span className="sr-only">Edit address</span>
                    </Button>
                  }
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleDelete(address.id)}
                  title="Delete address"
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Delete address</span>
                </Button>
              </div>
            </div>
            <address className="mt-2 text-sm not-italic text-muted-foreground">
              {address.line1}
              {address.line2 ? <>, {address.line2}</> : null}
              <br />
              {address.city}, {address.region} {address.postal_code}
              <br />
              {address.country}
            </address>
          </li>
        ))}
      </ul>
      <AddressDialog
        customerId={customerId}
        onDone={() => window.location.reload()}
        trigger={
          <Button variant="outline" size="sm">
            <Plus className="size-4" /> Add address
          </Button>
        }
      />
    </div>
  );
}
