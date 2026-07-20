import { v4 as uuid } from "uuid";
import {
  readBinaryBase64,
  readJsonFile,
  writeBinaryBase64,
  writeJsonFile,
} from "@/lib/data/fs";
import { paths } from "@/lib/data/paths";
import type { QuotationTemplate } from "@/lib/types";
import fs from "fs";
import path from "path";

const DEFAULT_TEMPLATE_ID = "classic";
const MAX_TEMPLATES = 3;

function defaultTemplates(): QuotationTemplate[] {
  const now = new Date().toISOString();
  return [
    {
      id: DEFAULT_TEMPLATE_ID,
      name: "Soni Creative",
      imagePath: paths.quotationTemplateImage(DEFAULT_TEMPLATE_ID, "png"),
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
  const publicPath = path.join(
    process.cwd(),
    "public",
    "quotation-templates",
    filename
  );
  if (fs.existsSync(publicPath)) {
    const buffer = fs.readFileSync(publicPath);
    writeBinaryBase64(imagePath, buffer.toString("base64"));
    return;
  }

  const fallbackNames = [`${template.id}.png`, `${template.id}.jpg`];
  for (const name of fallbackNames) {
    const fallbackPath = path.join(
      process.cwd(),
      "public",
      "quotation-templates",
      name
    );
    if (fs.existsSync(fallbackPath)) {
      const buffer = fs.readFileSync(fallbackPath);
      writeBinaryBase64(imagePath, buffer.toString("base64"));
      return;
    }
  }
}

export function getQuotationTemplates(): QuotationTemplate[] {
  let templates = readJsonFile<QuotationTemplate[]>(
    paths.quotationTemplates(),
    []
  );
  if (!templates.length) {
    templates = defaultTemplates();
    writeJsonFile(paths.quotationTemplates(), templates);
  }

  const classicPath = paths.quotationTemplateImage(DEFAULT_TEMPLATE_ID, "png");
  let migrated = false;
  templates = templates.map((t) => {
    if (t.id !== DEFAULT_TEMPLATE_ID) return t;
    if (t.imagePath === classicPath && t.name === "Soni Creative") return t;
    migrated = true;
    return {
      ...t,
      name: "Soni Creative",
      imagePath: classicPath,
    };
  });
  if (migrated) writeJsonFile(paths.quotationTemplates(), templates);

  for (const t of templates) {
    seedTemplateImageIfMissing(t);
  }
  return templates;
}

export function getQuotationTemplate(
  id: string
): QuotationTemplate | undefined {
  return getQuotationTemplates().find((t) => t.id === id);
}

export function getQuotationTemplateImageDataUrl(
  id: string
): string | null {
  const template = getQuotationTemplate(id);
  const imagePath =
    template?.imagePath || paths.quotationTemplateImage(id, "png");
  if (template) seedTemplateImageIfMissing(template);
  const base64 = readBinaryBase64(imagePath);
  if (!base64) return null;
  return `data:${mimeForPath(imagePath)};base64,${base64}`;
}

export function addQuotationTemplate(
  name: string,
  imageBase64: string
): QuotationTemplate {
  const existing = getQuotationTemplates();
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
    imagePath: paths.quotationTemplateImage(id, ext),
    createdAt: new Date().toISOString(),
  };
  const raw = imageBase64.replace(/^data:image\/[a-z+]+;base64,/, "");
  writeBinaryBase64(template.imagePath, raw);
  existing.push(template);
  writeJsonFile(paths.quotationTemplates(), existing);
  return template;
}

export function removeQuotationTemplate(id: string): boolean {
  if (id === DEFAULT_TEMPLATE_ID) return false;
  const templates = getQuotationTemplates();
  const target = templates.find((t) => t.id === id);
  const next = templates.filter((t) => t.id !== id);
  if (next.length === templates.length) return false;
  writeJsonFile(paths.quotationTemplates(), next);
  if (target) {
    // Clearing binary payload effectively removes template image from storage.
    writeBinaryBase64(target.imagePath, "");
  }
  return true;
}
