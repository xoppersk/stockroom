/* C-06 Product wizard — screens/ProductWizard.html, step 2 of 4
 * ("Variants and stock"). Server component: existing collection
 * names (for the details datalist) come from the real catalog via
 * @/lib/shop/admin; the island builds variants and creates the
 * product through the createProduct server action. */

import { TaskBar } from "@/components/sr/TaskBar";
import { listConsoleProducts } from "@/lib/shop/admin";
import ProductWizardClient from "./ProductWizardClient";
import "@/styles/console-core.css";

export default async function ProductWizardPage() {
  const products = await listConsoleProducts();
  const collections = [...new Set(products.map((p) => p.collection).filter(Boolean))].sort();

  return (
    <>
      <TaskBar
        title="New product"
        closeLabel="Save draft and close"
        closeHref="/admin/products"
      />
      <ProductWizardClient collections={collections} />
    </>
  );
}
