import { Suspense } from "react";
import { getProductBySlug, getProducts } from "@/lib/shop/catalog";
import ProductClient from "./ProductClient";

/* S-03 — Product, wired to the real catalog: the published product (with
   variants, images, stock) is read server-side from Supabase. Unknown /
   unpublished slugs render the honest not-found state. */

export default function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <ProductInner params={params} />
    </Suspense>
  );
}

async function ProductInner({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await getProductBySlug(slug);
  if (!res.ok) {
    return <ProductClient slug={slug} product={null} related={[]} error={res.error} />;
  }
  if (!res.data) {
    return <ProductClient slug={slug} product={null} related={[]} error={null} />;
  }
  const allRes = await getProducts();
  const related = allRes.ok
    ? allRes.data.filter((p) => p.id !== res.data!.id).slice(0, 4)
    : [];
  return <ProductClient slug={slug} product={res.data} related={related} error={null} />;
}
