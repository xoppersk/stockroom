/** §7 CodeTag: discount code in mono, uppercase, dashed ink outline
 *  (Discounts.html). Used on Discounts and the Discount builder. */
export function CodeTag({ code }: { code: string }) {
  return <span className="code">{code}</span>;
}
