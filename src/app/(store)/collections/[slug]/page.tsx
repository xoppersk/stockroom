import { Suspense } from "react";
import CollectionClient from "./CollectionClient";

/* S-02 — params + useSearchParams are read inside the <Suspense> boundary
   (Cache Components: pass the promise down un-awaited; the child awaits). */
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
  return <CollectionClient slug={slug} />;
}
