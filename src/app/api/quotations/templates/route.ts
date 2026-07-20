import { NextRequest, NextResponse } from "next/server";
import { ensureSupabaseData } from "@/lib/data/init";
import {
  addQuotationTemplate,
  getQuotationTemplate,
  getQuotationTemplateImageDataUrl,
  getQuotationTemplates,
  removeQuotationTemplate,
} from "@/lib/quotations/templates";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  await ensureSupabaseData();
  const id = req.nextUrl.searchParams.get("id");
  const image = req.nextUrl.searchParams.get("image");

  if (id && image === "1") {
    const dataUrl = getQuotationTemplateImageDataUrl(id);
    if (!dataUrl) {
      return NextResponse.json({ error: "Template image not found" }, { status: 404 });
    }
    return NextResponse.json({ dataUrl });
  }

  if (id) {
    const template = getQuotationTemplate(id);
    if (!template) {
      return NextResponse.json({ error: "Template not found" }, { status: 404 });
    }
    const dataUrl = getQuotationTemplateImageDataUrl(id);
    return NextResponse.json({ template, dataUrl });
  }

  return NextResponse.json({ templates: getQuotationTemplates() });
}

export async function POST(req: NextRequest) {
  await ensureSupabaseData();
  const body = await req.json();

  if (body.action === "upload" && body.name && body.jpgBase64) {
    try {
      const template = addQuotationTemplate(
        String(body.name),
        String(body.jpgBase64)
      );
      const dataUrl = getQuotationTemplateImageDataUrl(template.id);
      return NextResponse.json({ template, dataUrl });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Could not upload template";
      return NextResponse.json({ error: message }, { status: 400 });
    }
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}

export async function DELETE(req: NextRequest) {
  await ensureSupabaseData();
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  const ok = removeQuotationTemplate(id);
  if (!ok) {
    return NextResponse.json({ error: "Cannot delete template" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
