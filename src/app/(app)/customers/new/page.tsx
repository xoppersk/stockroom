import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CustomerForm } from "@/components/customers/customer-form";
import { requireRole } from "@/lib/auth/roles";

export const metadata: Metadata = { title: "New customer" };

/**
 * Create a customer (admin + support). Tags and addresses are added from
 * the detail screen after creation.
 */
export default async function NewCustomerPage() {
  await requireRole(["admin", "support"], "/customers/new");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <div>
        <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
          <Link href="/customers">
            <ArrowLeft className="size-4" /> Customers
          </Link>
        </Button>
        <h1 className="font-display text-2xl font-semibold tracking-tight">New customer</h1>
        <p className="text-muted-foreground">
          Add someone to the directory. Tags and addresses come next, on their
          profile.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <CustomerForm submitLabel="Create customer" />
        </CardContent>
      </Card>
    </div>
  );
}
