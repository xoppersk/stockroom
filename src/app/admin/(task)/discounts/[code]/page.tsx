/* O-06 — /admin/discounts/[code] (screens/DiscountBuilder.html).
 * Async server component: an existing code loads via
 * getConsoleDiscount(code); an unknown code (and the explicit "new"
 * segment the list's Create button links to) opens the same builder
 * as a creation form — the drawn design routes creation through this
 * segment too. The builder island saves through the admin actions. */

import { getConsoleActor, getConsoleDiscount } from "@/lib/shop/admin";
import DiscountBuilderClient from "./DiscountBuilderClient";

export default async function DiscountBuilderPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: rawCode } = await params;
  const code = decodeURIComponent(rawCode).toUpperCase();
  const isNewRoute = code === "NEW";
  const [discount, actor] = await Promise.all([
    isNewRoute ? Promise.resolve(undefined) : getConsoleDiscount(code),
    getConsoleActor(),
  ]);

  return (
    <DiscountBuilderClient
      initialCode={isNewRoute ? "" : code}
      discount={discount ?? null}
      isNew={!discount}
      actorRole={actor.role}
    />
  );
}
