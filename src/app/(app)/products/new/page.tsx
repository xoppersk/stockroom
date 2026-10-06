import type { Metadata } from "next";

import { requireRole } from "@/lib/auth/roles";
import { createProductsClient } from "@/lib/products/types";
import { ProductWizard } from "@/components/products/product-wizard";

export const metadata: Metadata = { title: "New product" };

/**
 * New-product wizard. Admin-only: every mutation in the catalog is gated by
 * `requireRole("admin")` in the server actions, and the page itself redirects
 * non-admin staff away rather than showing a dead form.
 */
export default async function NewProductPage() {
  await requireRole("admin", "/products/new");

  const supabase = await createProductsClient();
  const { data: categories } = await supabase
    .from("categories")
    .select("id, name")
    .order("name");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">New product</h1>
        <p className="text-muted-foreground">
          Four calm steps — details, variants, media, review — then save as a draft or publish.
        </p>
      </div>
      <ProductWizard categories={categories ?? []} />
    </div>
  );
}
