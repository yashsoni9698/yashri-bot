import { NextRequest, NextResponse } from "next/server";
import { ensureSupabaseData } from "@/lib/data/init";
import { deleteInvoice, getInvoices, saveInvoice } from "@/lib/invoices/store";

export const runtime = "nodejs";

export async function GET() {
  await ensureSupabaseData();
  return NextResponse.json({ invoices: getInvoices() });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();
  const {
    invoiceNumber, templateId, name, mobile, date,
    discount, columns, rows, subTotal, grandTotal,
  } = body;

  if (!invoiceNumber) {
    return NextResponse.json({ error: "invoiceNumber is required" }, { status: 400 });
  }

  const record = saveInvoice({
    invoiceNumber: String(invoiceNumber),
    templateId: String(templateId || ""),
    name: String(name || ""),
    mobile: String(mobile || ""),
    date: String(date || ""),
    discount: Number(discount) || 0,
    columns: columns || [],
    rows: rows || [],
    subTotal: Number(subTotal) || 0,
    grandTotal: Number(grandTotal) || 0,
  });
  return NextResponse.json({ record });
}

export async function DELETE(req: NextRequest) {
  await ensureSupabaseData();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = deleteInvoice(id);
  if (!ok) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
