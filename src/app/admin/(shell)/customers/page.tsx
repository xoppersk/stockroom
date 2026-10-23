/* O-03 — /admin/customers (screens/Customers.html).
 * Async server component: rows from listConsoleCustomers() (staff RLS),
 * totals from consoleCustomersTotals(list, orders) — derived over the
 * real mapped list + orders. The interactive table (segment / search /
 * sort in the URL query) lives in CustomersClient. */

import {
  consoleCustomersTotals,
  listConsoleCustomers,
  listConsoleOrders,
} from "@/lib/shop/admin";
import CustomersClient from "./CustomersClient";

export default async function CustomersPage() {
  const [customers, orders] = await Promise.all([
    listConsoleCustomers(),
    listConsoleOrders(),
  ]);
  const totals = consoleCustomersTotals(customers, orders);
  return <CustomersClient customers={customers} totals={totals} />;
}
