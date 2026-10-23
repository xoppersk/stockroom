import { Suspense } from "react";
import { getProductsByCategorySlug } from "@/lib/shop/catalog";
import CollectionClient from "./CollectionClient";

/* S-02 — Collection, wired to the real catalog: the category and its
   published products are read server-side from Supabase (public RLS).
   An unknown slug renders the honest empty state in the client island. */

export default function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  return (
    <Suspense fallback={null}>
      <CollectionInner params={params} />
    </Suspense>
  );
}

async function CollectionInner({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await getProductsByCategorySlug(slug);
  if (!res.ok) {
    return <CollectionClient slug={slug} category={null} products={[]} error={res.error} />;
  }
  return (
    <CollectionClient
      slug={slug}
      category={res.data.category}
      products={res.data.products}
      error={null}
    />
  );
}
