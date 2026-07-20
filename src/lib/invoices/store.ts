import { v4 as uuid } from "uuid";
import { readJsonFile, writeJsonFile } from "@/lib/data/fs";
import { paths } from "@/lib/data/paths";
import type { InvoiceRecord, QuotationColumn, QuotationRow } from "@/lib/types";

export function getInvoices(): InvoiceRecord[] {
  return readJsonFile<InvoiceRecord[]>(paths.invoices(), []);
}

export function getInvoice(id: string): InvoiceRecord | undefined {
  return getInvoices().find((r) => r.id === id);
}

export interface SaveInvoicePayload {
  invoiceNumber: string;
  templateId: string;
  name: string;
  mobile: string;
  date: string;
  discount: number;
  columns: QuotationColumn[];
  rows: QuotationRow[];
  subTotal: number;
  grandTotal: number;
}

export function saveInvoice(payload: SaveInvoicePayload): InvoiceRecord {
  const records = getInvoices();
  const now = new Date().toISOString();

  // Update existing if same invoiceNumber (overwrite on re-generate)
  const existingIdx = records.findIndex(
    (r) => r.invoiceNumber === payload.invoiceNumber
  );
  if (existingIdx >= 0) {
    const updated: InvoiceRecord = {
      ...records[existingIdx],
      ...payload,
      updatedAt: now,
    };
    records[existingIdx] = updated;
    writeJsonFile(paths.invoices(), records);
    return updated;
  }

  const record: InvoiceRecord = {
    id: uuid(),
    ...payload,
    createdAt: now,
    updatedAt: now,
  };
  records.unshift(record); // newest first
  writeJsonFile(paths.invoices(), records);
  return record;
}

export function deleteInvoice(id: string): boolean {
  const records = getInvoices();
  const next = records.filter((r) => r.id !== id);
  if (next.length === records.length) return false;
  writeJsonFile(paths.invoices(), next);
  return true;
}
