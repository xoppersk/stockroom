"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { SIGNATURE_QUEUE } from "@/lib/truth-ledger";

function toCsv(): string {
  const header = ["order_number", "customer", "items", "status", "total"];
  const esc = (value: string | number) => `"${String(value).replace(/"/g, '""')}"`;
  const lines = SIGNATURE_QUEUE.map((r) =>
    [r.orderNumber, r.customer, r.items, r.status, r.total].map(esc).join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

/**
 * "Export orders" — downloads the signature fulfillment queue as CSV
 * (Signature UI topline). The queue is the design's truth ledger
 * (src/lib/truth-ledger.ts), identical everywhere it appears.
 */
export function ExportOrdersButton() {
  const [exporting, setExporting] = useState(false);

  function runExport() {
    setExporting(true);
    try {
      const blob = new Blob([toCsv()], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "stockroom-order-queue-2026-10-06.csv";
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Button
      variant="outline"
      onClick={runExport}
      disabled={exporting}
      className="hidden sm:inline-flex"
    >
      {exporting ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
      Export orders
    </Button>
  );
}
