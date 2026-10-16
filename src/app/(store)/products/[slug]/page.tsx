import { Suspense } from "react";
import ProductClient from "./ProductClient";

/* S-03 — canonical slug: linen-apron. Params are read inside the
   <Suspense> boundary (Cache Components pattern). */
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
  return <ProductClient slug={slug} />;
}
