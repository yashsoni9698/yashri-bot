import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";
import {
  readBinaryBase64,
  readJsonFile,
  writeBinaryBase64,
  writeJsonFile,
} from "@/lib/data/fs";
import { paths } from "@/lib/data/paths";
import type { QuotationTemplate } from "@/lib/types";

const DEFAULT_TEMPLATE_ID = "invoice-classic";
const MAX_TEMPLATES = 3;

function defaultTemplates(): QuotationTemplate[] {
  const now = new Date().toISOString();
  return [
    {
      id: DEFAULT_TEMPLATE_ID,
      name: "Invoice Classic",
      imagePath: paths.invoiceTemplateImage(DEFAULT_TEMPLATE_ID, "png"),
      createdAt: now,
    },
  ];
}

function mimeForPath(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  return "image/jpeg";
}

function seedTemplateImageIfMissing(template: QuotationTemplate): void {
  const imagePath = template.imagePath;
  if (readBinaryBase64(imagePath)) return;

  const filename = path.basename(imagePath);
  const primaryPath = path.join(process.cwd(), "public", "quotation-templates", filename);
  if (fs.existsSync(primaryPath)) {
    const buffer = fs.readFileSync(primaryPath);
    writeBinaryBase64(imagePath, buffer.toString("base64"));
    return;
  }

  const fallbackNames = ["classic.png", "classic.jpg", `${template.id}.png`, `${template.id}.jpg`];
  for (const name of fallbackNames) {
    const fallbackPath = path.join(process.cwd(), "public", "quotation-templates", name);
    if (fs.existsSync(fallbackPath)) {
      const buffer = fs.readFileSync(fallbackPath);
      writeBinaryBase64(imagePath, buffer.toString("base64"));
      return;
    }
  }
}

export function getInvoiceTemplates(): QuotationTemplate[] {
  let templates = readJsonFile<QuotationTemplate[]>(paths.invoiceTemplates(), []);
  if (!templates.length) {
    templates = defaultTemplates();
    writeJsonFile(paths.invoiceTemplates(), templates);
  }
  for (const t of templates) {
    seedTemplateImageIfMissing(t);
  }
  return templates;
}

export function getInvoiceTemplate(id: string): QuotationTemplate | undefined {
  return getInvoiceTemplates().find((t) => t.id === id);
}

export function getInvoiceTemplateImageDataUrl(id: string): string | null {
  const template = getInvoiceTemplate(id);
  const imagePath = template?.imagePath || paths.invoiceTemplateImage(id, "png");
  if (template) seedTemplateImageIfMissing(template);
  const base64 = readBinaryBase64(imagePath);
  if (!base64) return null;
  return `data:${mimeForPath(imagePath)};base64,${base64}`;
}

export function addInvoiceTemplate(name: string, imageBase64: string): QuotationTemplate {
  const existing = getInvoiceTemplates();
  if (existing.length >= MAX_TEMPLATES) {
    throw new Error(`You can add up to ${MAX_TEMPLATES} templates only.`);
  }
  const clean = name.trim() || "Untitled";
  const id = uuid().slice(0, 8);
  const isPng = /^data:image\/png/i.test(imageBase64);
  const ext = isPng ? "png" : "jpg";
  const template: QuotationTemplate = {
    id,
    name: clean,
    imagePath: paths.invoiceTemplateImage(id, ext),
    createdAt: new Date().toISOString(),
  };
  const raw = imageBase64.replace(/^data:image\/[a-z+]+;base64,/, "");
  writeBinaryBase64(template.imagePath, raw);
  existing.push(template);
  writeJsonFile(paths.invoiceTemplates(), existing);
  return template;
}

export function removeInvoiceTemplate(id: string): boolean {
  if (id === DEFAULT_TEMPLATE_ID) return false;
  const templates = getInvoiceTemplates();
  const target = templates.find((t) => t.id === id);
  const next = templates.filter((t) => t.id !== id);
  if (next.length === templates.length) return false;
  writeJsonFile(paths.invoiceTemplates(), next);
  if (target) {
    writeBinaryBase64(target.imagePath, "");
  }
  return true;
}
