import { access, readFile } from "fs/promises";
import path from "path";
import PDFDocument from "pdfkit";
import { recordAuditEvent } from "./auditService";
import {
  toRenderableMemberValue,
  type CanonicalAnswers,
} from "./documentGenerationService";
import {
  claimDocumentGenerationRunById,
  createGeneratedDocumentVersion,
  getDocumentById,
  getTemplateArtifactById,
  listDocumentOutputSigners,
  updateDocument,
  updateDocumentGenerationRun,
  type DocumentGenerationRunRecord,
  type DocumentOutputSignerRecord,
  type DocumentRecord,
  type TemplateArtifactRecord,
} from "./documentService";
import { uploadGeneratedDocument } from "./storageService";
import { logDocumentTrace } from "../utils/documentTrace";

const PDF_PAGE_MARGINS = {
  top: 86,
  right: 54,
  bottom: 54,
  left: 54,
} as const;
const LOGO_TARGET_WIDTH = 44;
const BODY_TEXT_COLOR = "#1a1a1a";
const HEADING_TEXT_COLOR = "#111111";
const MUTED_TEXT_COLOR = "#6a6a6a";
const ACCENT_TEXT_COLOR = "#1f1f1f";
const BORDER_COLOR = "#d4d4d4";
const CHECKBOX_FILL_COLOR = "#dddddd";
const SIGNATURE_FILL_COLOR = "#f5f5f5";
const BODY_FONT_SIZE = 10;
const TITLE_FONT_SIZE = 15.4;
const HEADING_FONT_SIZE = 11.8;
const NOTICE_FONT_SIZE = 8.5;
const FINE_PRINT_FONT_SIZE = 7.2;
const BODY_LINE_GAP = 2.8;
const HEADING_LINE_GAP = 3.1;
const TITLE_LINE_GAP = 3.4;
const NOTICE_LINE_GAP = 1.8;
const FINE_PRINT_LINE_GAP = 1.3;
const INLINE_VALUE_OPEN = "[[DARCI_VALUE]]";
const INLINE_VALUE_CLOSE = "[[/DARCI_VALUE]]";
const INLINE_PENDING_OPEN = "[[DARCI_PENDING]]";
const INLINE_PENDING_CLOSE = "[[/DARCI_PENDING]]";
const BLOCK_CHECKED_PREFIX = "[[DARCI_CHECKED]] ";
const BLOCK_UNCHECKED_PREFIX = "[[DARCI_UNCHECKED]] ";
const BLOCK_SIGNATURE_PREFIX = "[[DARCI_SIGNATURE]] ";
const BLOCK_SIGNATURE_DATE_PREFIX = "[[DARCI_SIGNATURE_DATE]] ";

export const PREVIEW_WATERMARK_TEXT = "Preview document only, not official";

type PdfDocument = InstanceType<typeof PDFDocument>;
type InlineAnnotationStyle = "value" | "pending";
type SelectionCatalog = {
  allowedValues: string[];
  allowedValueLabels: Record<string, string>;
};
type BrandLogoPath = {
  d: string;
  fill: string;
};
type BrandLogo = {
  viewBoxWidth: number;
  viewBoxHeight: number;
  paths: BrandLogoPath[];
};
type PdfFontSet = {
  regular: string;
  emphasis: string;
  strong: string;
  italic: string;
  mono: string;
};
type TemplateBlock =
  | { kind: "blank" }
  | { kind: "title" | "heading" | "notice" | "fineprint" | "paragraph" | "bullet" | "table"; text: string }
  | { kind: "checklist"; text: string; checked: boolean }
  | { kind: "signature"; text: string; includeDate: boolean };

const systemPlaceholderTokens = new Set([
  "DarciNo",
  "Trust.No",
  "DdpoaNo",
  "Trust.RegDate",
  "QR Code",
  "CA_Notarial_Acknowledgment_Block",
  "County",
  "Day",
  "Month",
  "Year",
  "Illuminotary",
  "day.[ordinal]",
  "month",
  "year",
  "NotaryState",
]);

const trusteePowerLabels: Record<string, string> = {
  real_property: "Real property",
  personal_property: "Personal property",
  banking_and_financial: "Banking and financial",
  stocks_and_bonds: "Stocks and bonds",
  commodities_and_options: "Commodities and options",
  insurance_and_annuities: "Insurance and annuities",
  government_securities: "Government securities",
  margin_transactions: "Margin transactions",
  mutual_funds: "Mutual funds",
  claims_and_litigation: "Claims and litigation",
  business_operations: "Business operations",
  tax_matters: "Tax matters",
};

const trusteePowerKeyByTemplateLabel: Record<string, string> = {
  "real property": "real_property",
  "personal property": "personal_property",
  "banking and financial": "banking_and_financial",
  "stocks and bonds": "stocks_and_bonds",
  "commodities and options": "commodities_and_options",
  "insurance and annuities": "insurance_and_annuities",
  "government securities": "government_securities",
  "margin transactions": "margin_transactions",
  "mutual funds": "mutual_funds",
  "claims and litigation": "claims_and_litigation",
  "business operations": "business_operations",
  "tax matters": "tax_matters",
};

const poaAuthorityKeyByLetter: Record<string, string> = {
  A: "real_property",
  B: "personal_property",
  C: "stocks_and_bonds",
  D: "commodities_and_options",
  E: "banking_and_financial",
  F: "business_operations",
  G: "insurance_and_annuities",
  H: "estate_trust_and_other_beneficiary_transactions",
  I: "claims_and_litigation",
  J: "personal_and_family_maintenance",
  K: "government_and_military_benefits",
  L: "retirement_plan_transactions",
  M: "tax_matters",
  N: "all_powers",
};

const poaAuthorityKeyAliases: Record<string, string[]> = {
  personal_property: ["tangible_personal_property", "tangible_personal_property_transactions"],
  banking_and_financial: [
    "banking_and_other_financial_institution_transactions",
    "banking_transactions",
  ],
  estate_trust_and_other_beneficiary_transactions: [
    "estate_trust_and_other_beneficiary_transactions",
    "estate_trust_and_other_beneficiary",
  ],
  personal_and_family_maintenance: ["personal_family_maintenance"],
  government_and_military_benefits: [
    "benefits_from_government_programs",
    "benefits_from_social_security_medicare_medicaid_or_other_governmental_programs_or_civil_or_military_service",
  ],
  retirement_plan_transactions: ["retirement_plans", "retirement_plan"],
  all_powers: ["all_of_the_powers_listed_above", "all_powers_listed_above"],
};

const poaAuthorityDisplayLabels: Record<string, string> = {
  real_property: "Real property transactions",
  personal_property: "Tangible personal property transactions",
  stocks_and_bonds: "Stock and bond transactions",
  commodities_and_options: "Commodity and option transactions",
  banking_and_financial: "Banking and other financial institution transactions",
  business_operations: "Business operating transactions",
  insurance_and_annuities: "Insurance and annuity transactions",
  estate_trust_and_other_beneficiary_transactions:
    "Estate, trust, and other beneficiary transactions",
  claims_and_litigation: "Claims and litigation",
  personal_and_family_maintenance: "Personal and family maintenance",
  government_and_military_benefits:
    "Benefits from Social Security, Medicare, Medicaid, or other governmental programs, or civil or military service",
  retirement_plan_transactions: "Retirement plan transactions",
  tax_matters: "Tax matters",
  all_powers: "ALL OF THE POWERS LISTED ABOVE",
};

const asTrimmedString = (value: unknown) => {
  return typeof value === "string" ? value.trim() : "";
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const parseJsonString = (value: string) => {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
};

const formatDateValue = (value: unknown) => {
  const candidate = asTrimmedString(value);
  if (!candidate) {
    return null;
  }

  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    return candidate;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
};

const getRenderContext = (run: DocumentGenerationRunRecord) => {
  return isRecord(run.render_context_json) ? run.render_context_json : {};
};

const toNonEmptyStringArray = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0);
};

const toStringRecord = (value: unknown) => {
  if (!isRecord(value)) {
    return {} as Record<string, string>;
  }

  const entries = Object.entries(value)
    .map(([key, entryValue]) => {
      const normalizedKey = key.trim();
      const normalizedValue = typeof entryValue === "string" ? entryValue.trim() : "";
      return [normalizedKey, normalizedValue] as const;
    })
    .filter(([key, entryValue]) => key.length > 0 && entryValue.length > 0);

  return Object.fromEntries(entries);
};

const parseSelectionCatalog = (value: unknown): SelectionCatalog | null => {
  if (!isRecord(value)) {
    return null;
  }

  return {
    allowedValues: toNonEmptyStringArray(value.allowedValues),
    allowedValueLabels: toStringRecord(value.allowedValueLabels),
  };
};

const getSelectionCatalogs = (run: DocumentGenerationRunRecord) => {
  const renderContext = getRenderContext(run);
  if (!isRecord(renderContext.selectionCatalogs)) {
    return {} as Record<string, SelectionCatalog>;
  }

  const catalogs: Record<string, SelectionCatalog> = {};

  for (const [fieldKey, value] of Object.entries(renderContext.selectionCatalogs)) {
    const catalog = parseSelectionCatalog(value);
    if (!catalog) {
      continue;
    }

    catalogs[fieldKey] = catalog;
  }

  return catalogs;
};

const getCanonicalAnswers = (run: DocumentGenerationRunRecord): CanonicalAnswers => {
  const renderContext = getRenderContext(run);
  return isRecord(renderContext.canonicalAnswers)
    ? (renderContext.canonicalAnswers as CanonicalAnswers)
    : {};
};

const getPlaceholderValues = (run: DocumentGenerationRunRecord) => {
  const renderContext = getRenderContext(run);
  return isRecord(renderContext.placeholders)
    ? (renderContext.placeholders as Record<string, unknown>)
    : {};
};

const getArtifactMetadata = (artifact: TemplateArtifactRecord) => {
  return isRecord(artifact.artifact_metadata) ? artifact.artifact_metadata : {};
};

const loadTemplateSource = async (artifact: TemplateArtifactRecord) => {
  const metadata = getArtifactMetadata(artifact);
  const localTemplatePath = asTrimmedString(metadata.localTemplatePath);
  if (!localTemplatePath) {
    return null;
  }

  const candidatePaths = path.isAbsolute(localTemplatePath)
    ? [localTemplatePath]
    : [
        path.resolve(process.cwd(), localTemplatePath),
        path.resolve(process.cwd(), "..", localTemplatePath),
      ];

  for (const candidatePath of new Set(candidatePaths)) {
    try {
      return await readFile(candidatePath, "utf8");
    } catch {
      continue;
    }
  }

  return null;
};

const resolveWorkspaceAssetPath = async (relativePath: string) => {
  const candidatePaths = [
    path.resolve(process.cwd(), relativePath),
    path.resolve(process.cwd(), "..", relativePath),
  ];

  for (const candidatePath of new Set(candidatePaths)) {
    try {
      await access(candidatePath);
      return candidatePath;
    } catch {
      continue;
    }
  }

  return null;
};

const readWorkspaceAsset = async (relativePath: string) => {
  const resolvedPath = await resolveWorkspaceAssetPath(relativePath);
  if (!resolvedPath) {
    return null;
  }

  try {
    return await readFile(resolvedPath, "utf8");
  } catch {
    return null;
  }
};

const parseBrandLogo = (svgContent: string): BrandLogo | null => {
  const viewBoxMatch = svgContent.match(/viewBox="[^"]*?(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)"/i);
  if (!viewBoxMatch) {
    return null;
  }

  const viewBoxWidth = Number.parseFloat(viewBoxMatch[3] ?? "0");
  const viewBoxHeight = Number.parseFloat(viewBoxMatch[4] ?? "0");
  if (!Number.isFinite(viewBoxWidth) || !Number.isFinite(viewBoxHeight) || viewBoxWidth <= 0 || viewBoxHeight <= 0) {
    return null;
  }

  const paths: BrandLogoPath[] = [];
  const pathPattern = /<path[^>]*d="([^"]+)"[^>]*fill="([^"]+)"[^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(svgContent)) !== null) {
    const d = match[1]?.trim() ?? "";
    const fill = match[2]?.trim() ?? "black";
    if (!d) {
      continue;
    }

    paths.push({ d, fill });
  }

  return paths.length > 0
    ? {
        viewBoxWidth,
        viewBoxHeight,
        paths,
      }
    : null;
};

type PdfBrandAssets = {
  fonts: {
    regular: string | null;
    emphasis: string | null;
    strong: string | null;
    italic: string | null;
    mono: string | null;
  };
  logo: BrandLogo | null;
};

let brandAssetsPromise: Promise<PdfBrandAssets> | null = null;

const loadPdfBrandAssets = async () => {
  if (!brandAssetsPromise) {
    brandAssetsPromise = (async () => {
      const [regular, emphasis, strong, italic, mono, logoSvg] = await Promise.all([
        resolveWorkspaceAssetPath("apps/web/public/fonts/maison/MaisonNeue-Book.ttf"),
        resolveWorkspaceAssetPath("apps/web/public/fonts/maison/MaisonNeue-Medium.ttf"),
        resolveWorkspaceAssetPath("apps/web/public/fonts/maison/MaisonNeue-Demi.ttf"),
        resolveWorkspaceAssetPath("apps/web/public/fonts/maison/MaisonNeue-BookItalic.ttf"),
        resolveWorkspaceAssetPath("apps/web/public/fonts/maison/MaisonNeue-Mono.ttf"),
        readWorkspaceAsset("apps/web/public/icons/navbar/darci_black.svg"),
      ]);

      return {
        fonts: {
          regular,
          emphasis,
          strong,
          italic,
          mono,
        },
        logo: logoSvg ? parseBrandLogo(logoSvg) : null,
      } satisfies PdfBrandAssets;
    })();
  }

  return brandAssetsPromise;
};

const registerPdfFonts = (document: PdfDocument, assets: PdfBrandAssets): PdfFontSet => {
  const fontNames: PdfFontSet = {
    regular: "Helvetica",
    emphasis: "Helvetica-Bold",
    strong: "Helvetica-Bold",
    italic: "Helvetica-Oblique",
    mono: "Courier",
  };

  if (assets.fonts.regular) {
    document.registerFont("DarciMaisonRegular", assets.fonts.regular);
    fontNames.regular = "DarciMaisonRegular";
  }

  if (assets.fonts.emphasis) {
    document.registerFont("DarciMaisonEmphasis", assets.fonts.emphasis);
    fontNames.emphasis = "DarciMaisonEmphasis";
  }

  if (assets.fonts.strong) {
    document.registerFont("DarciMaisonStrong", assets.fonts.strong);
    fontNames.strong = "DarciMaisonStrong";
  }

  if (assets.fonts.italic) {
    document.registerFont("DarciMaisonItalic", assets.fonts.italic);
    fontNames.italic = "DarciMaisonItalic";
  }

  if (assets.fonts.mono) {
    document.registerFont("DarciMaisonMono", assets.fonts.mono);
    fontNames.mono = "DarciMaisonMono";
  }

  return fontNames;
};

const normalizePlaceholderToken = (value: string) => {
  return value.trim().replace(/\\([\[\]])/g, "$1").replace(/\s+/g, " ");
};

const unescapeTemplateSource = (value: string) => {
  return value
    .replace(/\\([<>{}\[\]_*])/g, "$1")
    .replace(/^# \*\*{{QR Code}}\*\*$/gm, "{{QR Code}}")
    .replace(
      /^# \*\*{{CA_Notarial_Acknowledgment_Block}}\*\*$/gm,
      "{{CA_Notarial_Acknowledgment_Block}}",
    );
};

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const humanizeOptionKey = (value: string) => {
  return value
    .split(/[_-]+/)
    .filter((segment) => segment.length > 0)
    .map((segment) => segment[0]?.toUpperCase() + segment.slice(1))
    .join(" ");
};

const annotateInlineText = (text: string, style: InlineAnnotationStyle) => {
  if (!text || text.includes("\n")) {
    return text;
  }

  if (style === "pending") {
    return `${INLINE_PENDING_OPEN}${text}${INLINE_PENDING_CLOSE}`;
  }

  return `${INLINE_VALUE_OPEN}${text}${INLINE_VALUE_CLOSE}`;
};

export const stripRenderControlTokens = (value: string) => {
  return value
    .replaceAll(INLINE_VALUE_OPEN, "")
    .replaceAll(INLINE_VALUE_CLOSE, "")
    .replaceAll(INLINE_PENDING_OPEN, "")
    .replaceAll(INLINE_PENDING_CLOSE, "")
    .replaceAll("[[/DARCI_VALUE", "")
    .replaceAll("[[/DARCI_PENDING", "")
    .replace(new RegExp(`^${escapeRegex(BLOCK_CHECKED_PREFIX)}`, "gm"), "")
    .replace(new RegExp(`^${escapeRegex(BLOCK_UNCHECKED_PREFIX)}`, "gm"), "")
    .replace(new RegExp(`^${escapeRegex(BLOCK_SIGNATURE_PREFIX)}`, "gm"), "")
    .replace(new RegExp(`^${escapeRegex(BLOCK_SIGNATURE_DATE_PREFIX)}`, "gm"), "");
};

type PositionedTextOptions = PDFKit.Mixins.TextOptions & {
  x?: number;
  y?: number;
};

type TextRenderProfile = {
  baseFont: string;
  valueFont: string;
  pendingFont: string;
  fontSize: number;
  color: string;
  valueColor: string;
  pendingColor: string;
};

type AnnotatedSegment = {
  text: string;
  style: "body" | InlineAnnotationStyle;
};

const parseAnnotatedSegments = (value: string) => {
  const pattern = /\[\[(DARCI_VALUE|DARCI_PENDING)\]\]([\s\S]*?)\[\[\/(DARCI_VALUE|DARCI_PENDING)\]\]/g;
  const segments: AnnotatedSegment[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(value)) !== null) {
    const fullMatch = match[0] ?? "";
    const openTag = match[1] ?? "";
    const closeTag = match[3] ?? "";
    const text = match[2] ?? "";
    if (!fullMatch || openTag !== closeTag) {
      continue;
    }

    if (match.index > cursor) {
      segments.push({
        text: value.slice(cursor, match.index),
        style: "body",
      });
    }

    segments.push({
      text,
      style: openTag === "DARCI_PENDING" ? "pending" : "value",
    });

    cursor = match.index + fullMatch.length;
  }

  if (cursor < value.length) {
    segments.push({
      text: value.slice(cursor),
      style: "body",
    });
  }

  return segments.length > 0 ? segments : [{ text: value, style: "body" as const }];
};

const preserveCursor = (document: PdfDocument, render: () => void) => {
  const previousX = document.x;
  const previousY = document.y;
  render();
  document.x = previousX;
  document.y = previousY;
};

const renderAnnotatedText = (
  document: PdfDocument,
  text: string,
  profile: TextRenderProfile,
  options: PositionedTextOptions = {},
) => {
  const segments = parseAnnotatedSegments(text).filter((segment) => segment.text.length > 0);
  if (segments.length === 0) {
    return;
  }

  const { x, y, ...textOptions } = options;
  let isFirst = true;

  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index];
    if (!segment) {
      continue;
    }

    const isLast = index === segments.length - 1;
    const fontName =
      segment.style === "pending"
        ? profile.pendingFont
        : segment.style === "value"
          ? profile.valueFont
          : profile.baseFont;
    const fillColor =
      segment.style === "pending"
        ? profile.pendingColor
        : segment.style === "value"
          ? profile.valueColor
          : profile.color;

    document.font(fontName).fontSize(profile.fontSize).fillColor(fillColor);

    if (isFirst && x !== undefined && y !== undefined) {
      document.text(segment.text, x, y, {
        ...textOptions,
        continued: !isLast,
      });
      isFirst = false;
      continue;
    }

    document.text(segment.text, {
      ...textOptions,
      continued: !isLast,
    });
    isFirst = false;
  }
};

const drawSvgLogo = (document: PdfDocument, logo: BrandLogo, x: number, y: number) => {
  const scale = LOGO_TARGET_WIDTH / logo.viewBoxWidth;
  document.save();
  document.translate(x, y);
  document.scale(scale);

  for (const logoPath of logo.paths) {
    document.fillColor(logoPath.fill || "black");
    document.path(logoPath.d).fill();
  }

  document.restore();
};

const drawBrandHeader = (
  document: PdfDocument,
  input: {
    logo: BrandLogo | null;
    fonts: PdfFontSet;
    templateLabel: string;
  },
) => {
  preserveCursor(document, () => {
    const left = document.page.margins.left;
    const right = document.page.width - document.page.margins.right;
    const headerY = 28;

    if (input.logo) {
      drawSvgLogo(document, input.logo, left, headerY);
    }

    document
      .font(input.fonts.regular)
      .fontSize(8.2)
      .fillColor(MUTED_TEXT_COLOR)
      .text(input.templateLabel, right - 180, headerY + 4, {
        width: 180,
        align: "right",
        lineBreak: false,
      });
  });
};

const drawChecklistItem = (
  document: PdfDocument,
  text: string,
  checked: boolean,
  fonts: PdfFontSet,
) => {
  const startX = document.page.margins.left;
  const startY = document.y;
  const boxSize = 11;
  const boxY = startY + Math.round((BODY_FONT_SIZE + BODY_LINE_GAP - boxSize) / 2);
  const textX = startX + 18;
  const width = document.page.width - document.page.margins.right - textX;

  document.save();
  if (checked) {
    document.fillColor(CHECKBOX_FILL_COLOR).roundedRect(startX, boxY, boxSize, boxSize, 2).fill();
    document
      .lineWidth(1.2)
      .strokeColor(ACCENT_TEXT_COLOR)
      .moveTo(startX + 2.2, boxY + 6)
      .lineTo(startX + 4.7, boxY + 8.5)
      .lineTo(startX + 8.8, boxY + 2.8)
      .stroke();
  } else {
    document
      .lineWidth(1)
      .strokeColor(BORDER_COLOR)
      .roundedRect(startX, boxY, boxSize, boxSize, 2)
      .stroke();
  }
  document.restore();

  renderAnnotatedText(
    document,
    text,
    {
      baseFont: fonts.regular,
      valueFont: fonts.emphasis,
      pendingFont: fonts.italic,
      fontSize: BODY_FONT_SIZE,
      color: BODY_TEXT_COLOR,
      valueColor: ACCENT_TEXT_COLOR,
      pendingColor: MUTED_TEXT_COLOR,
    },
    {
      x: textX,
      y: startY,
      width,
      lineGap: BODY_LINE_GAP,
    },
  );

  document.x = startX;
  document.moveDown(0.14);
};

const drawDashedRoundedRect = (
  document: PdfDocument,
  x: number,
  y: number,
  width: number,
  height: number,
) => {
  document.save();
  document.fillColor(SIGNATURE_FILL_COLOR).roundedRect(x, y, width, height, 6).fill();
  document
    .dash(4, { space: 3 })
    .lineWidth(1)
    .strokeColor(BORDER_COLOR)
    .roundedRect(x, y, width, height, 6)
    .stroke();
  document.undash();
  document.restore();
};

const drawDigitalSignatureField = (
  document: PdfDocument,
  text: string,
  includeDate: boolean,
  fonts: PdfFontSet,
) => {
  const left = document.page.margins.left;
  const availableWidth =
    document.page.width - document.page.margins.left - document.page.margins.right;
  const labelY = document.y;

  renderAnnotatedText(
    document,
    text,
    {
      baseFont: fonts.emphasis,
      valueFont: fonts.strong,
      pendingFont: fonts.italic,
      fontSize: 9.2,
      color: MUTED_TEXT_COLOR,
      valueColor: ACCENT_TEXT_COLOR,
      pendingColor: MUTED_TEXT_COLOR,
    },
    {
      x: left,
      y: labelY,
      width: availableWidth,
      lineGap: BODY_LINE_GAP,
    },
  );

  const boxY = document.y + 6;
  const dateWidth = includeDate ? 106 : 0;
  const gap = includeDate ? 12 : 0;
  const signatureWidth = availableWidth - dateWidth - gap;

  drawDashedRoundedRect(document, left, boxY, signatureWidth, 40);
  document
    .font(fonts.italic)
    .fontSize(9)
    .fillColor(MUTED_TEXT_COLOR)
    .text("Digital signature", left + 12, boxY + 14, {
      lineBreak: false,
    });

  if (includeDate) {
    const dateX = left + signatureWidth + gap;
    drawDashedRoundedRect(document, dateX, boxY, dateWidth, 40);
    document
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(MUTED_TEXT_COLOR)
      .text("Date", dateX + 12, boxY + 14, {
        lineBreak: false,
      });
  }

  document.y = boxY + 52;
  document.x = left;
};

const ensurePageSpace = (document: PdfDocument, minHeight = 72) => {
  const pageBottom = document.page.height - document.page.margins.bottom;
  if (document.y + minHeight > pageBottom) {
    document.addPage();
  }
};

const normalizeTemplateLine = (value: string) => {
  const normalized = value
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .replace(/\\([_[\]])/g, "$1")
    .replace(/\t+/g, " ")
    .replace(/_+\[X\]_+/g, "")
    .replace(/(?<!\[\[\/DARCI_VALUE)(?<!\[\[\/DARCI_PENDING)\]\](?=[,.;:])/g, "")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+$/g, "");

  const boldOnlyHeadingMatch = normalized.trim().match(/^\*\*(.+?)\*\*$/);
  if (boldOnlyHeadingMatch) {
    const headingText = boldOnlyHeadingMatch[1]?.trim() ?? "";
    return headingText.length > 0 ? `## ${headingText}` : "";
  }

  return normalized.replace(/\*\*/g, "");
};

const parseContactValue = (value: unknown) => {
  if (isRecord(value)) {
    return {
      phone: asTrimmedString(value.phone) || null,
      email: asTrimmedString(value.email) || null,
    };
  }

  if (typeof value === "string") {
    const parsed = parseJsonString(value);
    if (parsed !== value) {
      return parseContactValue(parsed);
    }

    const segments = value.split(/[|,;]+/).map((segment) => segment.trim());
    const email = segments.find((segment) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(segment)) ?? null;
    const phone =
      segments.find((segment) => segment.replace(/\D/g, "").length >= 7) ?? null;

    return { phone, email };
  }

  return {
    phone: null,
    email: null,
  };
};

const parsePersonNames = (value: unknown) => {
  if (!Array.isArray(value)) {
    return [] as string[];
  }

  return value
    .map((entry) => {
      const parsed = typeof entry === "string" ? parseJsonString(entry) : entry;
      if (isRecord(parsed)) {
        return (
          asTrimmedString(parsed.fullName) ||
          asTrimmedString(parsed.name) ||
          asTrimmedString(parsed.displayName)
        );
      }

      return typeof parsed === "string" ? parsed.trim() : "";
    })
    .filter((entry) => entry.length > 0);
};

const formatRenderableValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const candidate = value.trim();
    return candidate.length > 0 ? candidate : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    const rendered = value
      .map((entry) => formatRenderableValue(entry))
      .filter((entry): entry is string => typeof entry === "string" && entry.length > 0);
    return rendered.length > 0 ? rendered.join(", ") : null;
  }

  if (isRecord(value)) {
    return (
      asTrimmedString(value.fullName) ||
      asTrimmedString(value.name) ||
      asTrimmedString(value.title) ||
      JSON.stringify(value)
    );
  }

  return null;
};

const containsAlphabeticCharacters = (value: string) => /[A-Za-z]/.test(value);

const parseSelectedOptionKeys = (value: unknown): string[] => {
  if (Array.isArray(value)) {
    return [...new Set(value.flatMap((entry) => parseSelectedOptionKeys(entry)))];
  }

  if (typeof value === "string") {
    const candidate = value.trim();
    if (!candidate) {
      return [];
    }

    const parsed = parseJsonString(candidate);
    if (parsed !== candidate) {
      return parseSelectedOptionKeys(parsed);
    }

    return [candidate];
  }

  if (isRecord(value)) {
    const directKey = asTrimmedString(value.key);
    const isExplicitlySelected =
      value.selected === true || value.selected === "true" || value.selected === 1;
    if (directKey && (value.selected === undefined || isExplicitlySelected)) {
      return [directKey];
    }

    return Object.entries(value)
      .flatMap(([key, entry]) => {
        if (entry === true || entry === "true" || entry === 1) {
          return [key.trim()];
        }

        if (isRecord(entry) && entry.selected === true) {
          return [key.trim()];
        }

        return [] as string[];
      })
      .filter((entry) => entry.length > 0);
  }

  return [];
};

const normalizeOptionComparisonText = (value: string) => {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const buildSelectionLabelMap = (
  catalog: SelectionCatalog | undefined,
  defaults: Record<string, string> = {},
) => {
  const labelMap: Record<string, string> = {
    ...defaults,
    ...(catalog?.allowedValueLabels ?? {}),
  };

  for (const key of catalog?.allowedValues ?? []) {
    if (!labelMap[key]) {
      labelMap[key] = defaults[key] ?? humanizeOptionKey(key);
    }
  }

  return labelMap;
};

const matchesSelectionKey = (
  selectedKeys: Set<string>,
  selectedLabels: Set<string>,
  label: string,
  key: string,
  aliases: string[] = [],
) => {
  if (selectedKeys.has(key) || aliases.some((alias) => selectedKeys.has(alias))) {
    return true;
  }

  const normalizedLabel = normalizeOptionComparisonText(label);
  return selectedLabels.has(normalizedLabel);
};

const previewFallbackCopy: Record<string, string> = {
  DarciNo: "Assigned after review approval",
  "Trust.No": "Assigned after review approval",
  DdpoaNo: "Assigned after review approval",
  "QR Code": "Verification URL will be assigned after review approval.",
  CA_Notarial_Acknowledgment_Block:
    "California notarial acknowledgment will be completed during notarization.",
  County: "________________",
  Day: "____",
  Month: "________________",
  Year: "________",
  Illuminotary: "________________",
  "day.[ordinal]": "____",
  month: "________________",
  year: "________",
};

const placeholderCanonicalKeyAliases: Record<string, string> = {
  TrustName: "trust_name",
  "Trustmaker(s)": "grantors",
  "Trustee(s)": "trustees",
  TrustDate: "trust_date",
  RevokePower: "revocation_holders",
  TaxSettlor: "grantors",
  TrustState: "jurisdiction",
  SignatureAuthority: "trustee_signature_authority",
  TrusteeIncapacityStandard: "trustee_incapacity_standard",
  "SpecialInstructions[text 6400]": "special_instructions",
  "all agents must act jointly to exercise these powers *OR* any may exercise these powers separately":
    "agent_signature_authority",
};

const normalizeAcknowledgmentPreviewText = (value: string) => {
  return value
    .replaceAll("[Acknowledgers pending]", "________________")
    .replaceAll("[County pending]", "________________")
    .replaceAll("[Day pending]", "____")
    .replaceAll("[Month pending]", "________________")
    .replaceAll("[Year pending]", "________")
    .replaceAll("[Notary pending]", "________________");
};

const resolveIndexedPriorDocumentValue = (
  canonicalAnswers: CanonicalAnswers,
  token: string,
) => {
  const match = token.match(/^Document(\d+)\.(Name|Date)$/);
  if (!match || !Array.isArray(canonicalAnswers.prior_document_items)) {
    return null;
  }

  const index = Number.parseInt(match[1] ?? "0", 10) - 1;
  const field = match[2];
  if (index < 0) {
    return null;
  }

  const item = canonicalAnswers.prior_document_items[index];
  const parsed = typeof item === "string" ? parseJsonString(item) : item;
  if (!isRecord(parsed)) {
    return null;
  }

  if (field === "Name") {
    return asTrimmedString(parsed.title) || asTrimmedString(parsed.document_type) || null;
  }

  return formatDateValue(parsed.date) ?? (asTrimmedString(parsed.date) || null);
};

const resolveIndexedPartyValue = (canonicalAnswers: CanonicalAnswers, token: string) => {
  const trustmakerMatch = token.match(/^TM(\d+)$/i);
  if (trustmakerMatch) {
    const names = parsePersonNames(canonicalAnswers.grantors);
    const index = Number.parseInt(trustmakerMatch[1] ?? "0", 10) - 1;
    return names[index] ?? null;
  }

  const trusteeMatch = token.match(/^Trustee(\d+)$/i);
  if (trusteeMatch) {
    const names = parsePersonNames(canonicalAnswers.trustees);
    const index = Number.parseInt(trusteeMatch[1] ?? "0", 10) - 1;
    return names[index] ?? null;
  }

  return null;
};

const resolveContactPlaceholderValue = (canonicalAnswers: CanonicalAnswers, token: string) => {
  const principalMatch = token.match(/^Principal\.(FullName|Phone|Email)$/);
  if (principalMatch) {
    const field = principalMatch[1];
    if (field === "FullName") {
      return asTrimmedString(canonicalAnswers.principal_full_name) || null;
    }

    const contact = parseContactValue(canonicalAnswers.principal_contact);
    return field === "Phone" ? contact.phone : contact.email;
  }

  const agentMatch = token.match(/^Agent\[(\d+)\]\.(FullName|Phone|Email)$/);
  if (agentMatch) {
    const index = Number.parseInt(agentMatch[1] ?? "0", 10);
    if (index !== 0) {
      return null;
    }

    const field = agentMatch[2];
    if (field === "FullName") {
      return asTrimmedString(canonicalAnswers.agent_full_name) || null;
    }

    const contact = parseContactValue(canonicalAnswers.agent_contact);
    return field === "Phone" ? contact.phone : contact.email;
  }

  return null;
};

const resolveCanonicalFallbackValue = (token: string, canonicalAnswers: CanonicalAnswers) => {
  const indexedPriorDocumentValue = resolveIndexedPriorDocumentValue(canonicalAnswers, token);
  if (indexedPriorDocumentValue) {
    return indexedPriorDocumentValue;
  }

  const indexedPartyValue = resolveIndexedPartyValue(canonicalAnswers, token);
  if (indexedPartyValue) {
    return indexedPartyValue;
  }

  const contactValue = resolveContactPlaceholderValue(canonicalAnswers, token);
  if (contactValue) {
    return contactValue;
  }

  const canonicalKey = placeholderCanonicalKeyAliases[token];
  if (!canonicalKey) {
    return null;
  }

  return toRenderableMemberValue(canonicalKey, canonicalAnswers);
};

const formatResolvedPlaceholderText = (token: string, value: unknown) => {
  if (token === "TrustDate" || /\.Date$/i.test(token)) {
    const formattedDate = formatDateValue(value);
    if (formattedDate) {
      return formattedDate;
    }
  }

  if (token === "QR Code") {
    const url = asTrimmedString(value);
    return url ? `Verification URL: ${url}` : null;
  }

  if (token === "CA_Notarial_Acknowledgment_Block") {
    const block = formatRenderableValue(value);
    return block ? normalizeAcknowledgmentPreviewText(block) : null;
  }

  return formatRenderableValue(value);
};

type RenderTransformContext = {
  canonicalAnswers: CanonicalAnswers;
  selectionCatalogs: Record<string, SelectionCatalog>;
};

const parsePoaAuthorityLine = (line: string) => {
  const match = line.trim().match(/^_+\s*\(([A-N])\)\s*(.+)$/i);
  if (!match) {
    return null;
  }

  return {
    letter: (match[1] ?? "").toUpperCase(),
    label: (match[2] ?? "").trim(),
  };
};

const transformPoaAuthorityLines = (
  lines: string[],
  startIndex: number,
  context: RenderTransformContext,
) => {
  const selectedKeys = new Set(parseSelectedOptionKeys(context.canonicalAnswers.authority_scope_selection));
  const catalog = context.selectionCatalogs.authority_scope_selection;
  const labelMap = buildSelectionLabelMap(catalog, poaAuthorityDisplayLabels);
  const selectedLabels = new Set(
    [...selectedKeys].map((key) =>
      normalizeOptionComparisonText(labelMap[key] ?? humanizeOptionKey(key)),
    ),
  );
  const transformed: string[] = [];
  const matchedSelectedKeys = new Set<string>();
  let index = startIndex;
  let sawAuthorityLine = false;
  const allPowersSelected = matchesSelectionKey(
    selectedKeys,
    selectedLabels,
    poaAuthorityDisplayLabels["all_powers"] ?? "ALL OF THE POWERS LISTED ABOVE",
    "all_powers",
    poaAuthorityKeyAliases.all_powers ?? [],
  );

  while (index < lines.length) {
    const currentLine = lines[index] ?? "";
    const parsed = parsePoaAuthorityLine(currentLine);
    if (!parsed) {
      if (sawAuthorityLine && currentLine.trim().length === 0) {
        index += 1;
        continue;
      }

      break;
    }

    sawAuthorityLine = true;

    const key = poaAuthorityKeyByLetter[parsed.letter] ?? "";
    const aliases = poaAuthorityKeyAliases[key] ?? [];
    const checked =
      allPowersSelected ||
      matchesSelectionKey(selectedKeys, selectedLabels, parsed.label, key, aliases);

    if (checked) {
      matchedSelectedKeys.add(key);
      for (const alias of aliases) {
        matchedSelectedKeys.add(alias);
      }
    }

    transformed.push(
      `${checked ? BLOCK_CHECKED_PREFIX : BLOCK_UNCHECKED_PREFIX}(${parsed.letter}) ${poaAuthorityDisplayLabels[key] ?? parsed.label}`,
    );
    index += 1;
  }

  const unmatchedSelectedKeys = [...selectedKeys].filter((key) => !matchedSelectedKeys.has(key));
  if (unmatchedSelectedKeys.length > 0) {
    for (const key of unmatchedSelectedKeys) {
      transformed.push(`${BLOCK_CHECKED_PREFIX}${labelMap[key] ?? humanizeOptionKey(key)}`);
    }
  }

  transformed.push("");

  return {
    lines: transformed,
    nextIndex: index - 1,
  };
};

const buildTemplateBlocks = (renderedTemplate: string) => {
  return renderedTemplate.split("\n").map((line): TemplateBlock => {
    const trimmed = line.trim();
    if (!trimmed) {
      return { kind: "blank" };
    }

    if (trimmed.startsWith(BLOCK_CHECKED_PREFIX)) {
      return {
        kind: "checklist",
        checked: true,
        text: trimmed.slice(BLOCK_CHECKED_PREFIX.length),
      };
    }

    if (trimmed.startsWith(BLOCK_UNCHECKED_PREFIX)) {
      return {
        kind: "checklist",
        checked: false,
        text: trimmed.slice(BLOCK_UNCHECKED_PREFIX.length),
      };
    }

    if (trimmed.startsWith(BLOCK_SIGNATURE_DATE_PREFIX)) {
      return {
        kind: "signature",
        includeDate: true,
        text: trimmed.slice(BLOCK_SIGNATURE_DATE_PREFIX.length),
      };
    }

    if (trimmed.startsWith(BLOCK_SIGNATURE_PREFIX)) {
      return {
        kind: "signature",
        includeDate: false,
        text: trimmed.slice(BLOCK_SIGNATURE_PREFIX.length),
      };
    }

    const headingMatch = trimmed.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      const text = headingMatch[2]?.trim() ?? "";
      if (!text) {
        return { kind: "blank" };
      }

      return {
        kind: headingMatch[1] === "#" ? "title" : "heading",
        text,
      };
    }

    if (trimmed.startsWith("Notice:")) {
      return {
        kind: "notice",
        text: trimmed,
      };
    }

    if (isNotarialFinePrintLine(trimmed)) {
      return {
        kind: "fineprint",
        text: trimmed,
      };
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed
        .split("|")
        .slice(1, -1)
        .map((cell) => cell.trim())
        .filter((cell) => cell.length > 0);

      if (cells.length === 0 || cells.every((cell) => /^:?-{2,}:?$/.test(cell))) {
        return { kind: "blank" };
      }

      return {
        kind: "table",
        text: cells.join("    |    "),
      };
    }

    if (/^[*-]\s+/.test(trimmed)) {
      return {
        kind: "bullet",
        text: trimmed.replace(/^[*-]\s+/, ""),
      };
    }

    return {
      kind: "paragraph",
      text: trimmed,
    };
  });
};

const shouldOmitRenderedLine = (line: string) => {
  const trimmed = line.trim();
  if (!trimmed) {
    return false;
  }

  if (/^[*-]\s*_+\s*,\s*dated\s*_+\.?$/i.test(trimmed)) {
    return true;
  }

  if (/^[*-]?\s*Et c(?:\.|…)+\s*$/i.test(trimmed)) {
    return true;
  }

  return false;
};

const normalizeSectionLabel = (value: string) => {
  return stripRenderControlTokens(value)
    .replace(/\*\*/g, "")
    .replace(/^#+\s+/, "")
    .replace(/[:\s]+$/g, "")
    .trim()
    .toLowerCase();
};

const isNotarialFinePrintLine = (value: string) => {
  return /^A notary public or other officer completing this certificate verifies only the identity/i.test(
    value.trim(),
  );
};

const isBlankSignatureLabel = (value: string) => {
  const visibleValue = stripRenderControlTokens(value)
    .replace(/[_\s.]+/g, "")
    .trim();

  return visibleValue.length === 0;
};

const parseTableCells = (line: string) => {
  return line
    .trim()
    .split("|")
    .slice(1, -1)
    .map((cell) => cell.trim());
};

const isMarkdownAlignmentRow = (cells: string[]) => {
  return cells.length > 0 && cells.every((cell) => /^:?-{2,}:?$/.test(cell));
};

const getSignatureTableEntries = (
  precedingLabel: string | null,
  context: RenderTransformContext,
) => {
  const normalizedLabel = normalizeSectionLabel(precedingLabel ?? "");

  if (normalizedLabel === "trustmaker(s)") {
    return parsePersonNames(context.canonicalAnswers.grantors);
  }

  if (normalizedLabel === "trustee(s)") {
    return parsePersonNames(context.canonicalAnswers.trustees);
  }

  return null;
};

const transformTableLines = (
  lines: string[],
  context: RenderTransformContext,
  precedingLabel: string | null,
) => {
  const rows = lines
    .map((line) => parseTableCells(line))
    .filter((cells) => !isMarkdownAlignmentRow(cells))
    .filter((cells) => cells.some((cell) => cell.length > 0));

  if (rows.length === 0) {
    return [] as string[];
  }

  const nonEmptyCells = rows.flatMap((row) => row.filter((cell) => cell.length > 0));
  const trusteePowerKeys = nonEmptyCells.map(
    (cell) => trusteePowerKeyByTemplateLabel[normalizeOptionComparisonText(cell)] ?? null,
  );
  const isTrusteePowerMatrix =
    nonEmptyCells.length >= 6 && trusteePowerKeys.every((key) => typeof key === "string");

  if (isTrusteePowerMatrix) {
    const selectedTrusteePowers = new Set(
      parseSelectedOptionKeys(
        context.canonicalAnswers.trustee_power_matrix ??
          context.canonicalAnswers.trustee_powers,
      ),
    );
    const labelMap = buildSelectionLabelMap(
      context.selectionCatalogs.trustee_power_matrix,
      trusteePowerLabels,
    );
    const selectedTrusteePowerLabels = new Set(
      [...selectedTrusteePowers].map((key) =>
        normalizeOptionComparisonText(labelMap[key] ?? humanizeOptionKey(key)),
      ),
    );

    return trusteePowerKeys.map((key) => {
      const resolvedKey = key ?? "";
      const label = labelMap[resolvedKey] ?? trusteePowerLabels[resolvedKey] ?? humanizeOptionKey(resolvedKey);
      const checked = matchesSelectionKey(
        selectedTrusteePowers,
        selectedTrusteePowerLabels,
        label,
        resolvedKey,
      );
      return `${checked ? BLOCK_CHECKED_PREFIX : BLOCK_UNCHECKED_PREFIX}${label}`;
    });
  }

  const isSignatureTable = rows.some((row) => row.some((cell) => /^date$/i.test(cell)));
  const isSingleColumnTable = rows.every(
    (row) => row.filter((cell) => cell.length > 0).length === 1,
  );

  if (isSignatureTable || isSingleColumnTable) {
    const derivedEntries = getSignatureTableEntries(precedingLabel, context);
    if (derivedEntries && derivedEntries.length > 0) {
      return derivedEntries.map((entry) => `${BLOCK_SIGNATURE_DATE_PREFIX}${entry}`);
    }

    if (derivedEntries && derivedEntries.length === 0) {
      return [] as string[];
    }

    return rows.flatMap((row) => {
      const hasDate = row.some((cell) => /^date$/i.test(cell));
      const entries = row.filter(
        (cell) => cell.length > 0 && !/^date$/i.test(cell) && !isBlankSignatureLabel(cell),
      );
      return entries.map((entry) =>
        hasDate ? `${BLOCK_SIGNATURE_DATE_PREFIX}${entry}` : `${BLOCK_SIGNATURE_PREFIX}${entry}`,
      );
    });
  }

  return rows.flatMap((row) => row.filter((cell) => cell.length > 0).map((cell) => `- ${cell}`));
};

const transformRenderedLines = (lines: string[], context: RenderTransformContext) => {
  const transformed: string[] = [];
  let previousMeaningfulLine: string | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (parsePoaAuthorityLine(line)) {
      const result = transformPoaAuthorityLines(lines, index, context);
      transformed.push(...result.lines);
      index = result.nextIndex;
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const tableLines = [line];
      while (index + 1 < lines.length) {
        const nextLine = lines[index + 1] ?? "";
        const nextTrimmed = nextLine.trim();
        if (!nextTrimmed.startsWith("|") || !nextTrimmed.endsWith("|")) {
          break;
        }

        tableLines.push(nextLine);
        index += 1;
      }

      transformed.push(...transformTableLines(tableLines, context, previousMeaningfulLine));
      continue;
    }

    transformed.push(line);

    if (trimmed.length > 0) {
      previousMeaningfulLine = line;
    }
  }

  return transformed;
};

const squashBlankLines = (lines: string[]) => {
  const squashed: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "##") {
      continue;
    }

    if (trimmed.length === 0) {
      if (squashed.length === 0 || squashed[squashed.length - 1] === "") {
        continue;
      }

      squashed.push("");
      continue;
    }

    squashed.push(line);
  }

  while (squashed[squashed.length - 1] === "") {
    squashed.pop();
  }

  return squashed;
};

export const applyPreviewWatermarkOverlay = (document: PdfDocument) => {
  const centerX = document.page.width / 2;
  const centerY = document.page.height / 2;
  const previousX = document.x;
  const previousY = document.y;
  const contentWidth =
    document.page.width - document.page.margins.left - document.page.margins.right;

  document.save();
  document.rotate(-28, { origin: [centerX, centerY] });
  document.font("Helvetica-Bold").fontSize(24).fillColor("#d5d5d5").opacity(0.22);
  document.text(PREVIEW_WATERMARK_TEXT, document.page.margins.left, centerY - 12, {
    width: contentWidth,
    align: "center",
    lineBreak: false,
  });
  document.opacity(1);
  document.restore();
  document.x = previousX;
  document.y = previousY;
};

const renderTemplateBlocks = (
  document: PdfDocument,
  blocks: TemplateBlock[],
  fonts: PdfFontSet,
) => {
  const bodyProfile: TextRenderProfile = {
    baseFont: fonts.regular,
    valueFont: fonts.emphasis,
    pendingFont: fonts.italic,
    fontSize: BODY_FONT_SIZE,
    color: BODY_TEXT_COLOR,
    valueColor: ACCENT_TEXT_COLOR,
    pendingColor: MUTED_TEXT_COLOR,
  };
  const headingProfile: TextRenderProfile = {
    baseFont: fonts.emphasis,
    valueFont: fonts.strong,
    pendingFont: fonts.italic,
    fontSize: HEADING_FONT_SIZE,
    color: HEADING_TEXT_COLOR,
    valueColor: HEADING_TEXT_COLOR,
    pendingColor: MUTED_TEXT_COLOR,
  };
  const titleProfile: TextRenderProfile = {
    baseFont: fonts.strong,
    valueFont: fonts.strong,
    pendingFont: fonts.italic,
    fontSize: TITLE_FONT_SIZE,
    color: HEADING_TEXT_COLOR,
    valueColor: HEADING_TEXT_COLOR,
    pendingColor: MUTED_TEXT_COLOR,
  };
  const noticeProfile: TextRenderProfile = {
    baseFont: fonts.regular,
    valueFont: fonts.emphasis,
    pendingFont: fonts.italic,
    fontSize: NOTICE_FONT_SIZE,
    color: MUTED_TEXT_COLOR,
    valueColor: BODY_TEXT_COLOR,
    pendingColor: MUTED_TEXT_COLOR,
  };
  const finePrintProfile: TextRenderProfile = {
    baseFont: fonts.regular,
    valueFont: fonts.emphasis,
    pendingFont: fonts.italic,
    fontSize: FINE_PRINT_FONT_SIZE,
    color: MUTED_TEXT_COLOR,
    valueColor: MUTED_TEXT_COLOR,
    pendingColor: MUTED_TEXT_COLOR,
  };

  for (const block of blocks) {
    if (block.kind === "blank") {
      document.moveDown(0.76);
      continue;
    }

    if (block.kind === "title") {
      ensurePageSpace(document, 72);
      renderAnnotatedText(document, block.text, titleProfile, {
        lineGap: TITLE_LINE_GAP,
      });
      document.moveDown(0.34);
      continue;
    }

    if (block.kind === "heading") {
      ensurePageSpace(document, 56);
      renderAnnotatedText(document, block.text, headingProfile, {
        lineGap: HEADING_LINE_GAP,
      });
      document.moveDown(0.28);
      continue;
    }

    if (block.kind === "notice") {
      ensurePageSpace(document, 48);
      renderAnnotatedText(document, block.text, noticeProfile, {
        lineGap: NOTICE_LINE_GAP,
      });
      document.moveDown(0.2);
      continue;
    }

    if (block.kind === "fineprint") {
      ensurePageSpace(document, 34);
      renderAnnotatedText(document, block.text, finePrintProfile, {
        lineGap: FINE_PRINT_LINE_GAP,
      });
      document.moveDown(0.12);
      continue;
    }

    if (block.kind === "bullet") {
      ensurePageSpace(document, 30);
      renderAnnotatedText(document, `• ${block.text}`, bodyProfile, {
        indent: 12,
        lineGap: BODY_LINE_GAP,
      });
      continue;
    }

    if (block.kind === "checklist") {
      ensurePageSpace(document, 28);
      drawChecklistItem(document, block.text, block.checked, fonts);
      continue;
    }

    if (block.kind === "signature") {
      ensurePageSpace(document, 96);
      drawDigitalSignatureField(document, block.text, block.includeDate, fonts);
      continue;
    }

    if (block.kind === "table") {
      ensurePageSpace(document, 30);
      renderAnnotatedText(document, block.text, bodyProfile, {
        indent: 8,
        lineGap: BODY_LINE_GAP,
      });
      continue;
    }

    ensurePageSpace(document, 42);
    renderAnnotatedText(document, block.text, bodyProfile, {
      lineGap: BODY_LINE_GAP,
    });
  }
};

export const renderLegalTemplateText = (input: {
  templateSource: string;
  placeholders: Record<string, unknown>;
  canonicalAnswers?: CanonicalAnswers;
  selectionCatalogs?: Record<string, SelectionCatalog>;
  isPreview: boolean;
}) => {
  const normalizedTemplateSource = unescapeTemplateSource(input.templateSource);
  const placeholderLookup = new Map(
    Object.entries(input.placeholders).map(([key, value]) => [
      normalizePlaceholderToken(key),
      value,
    ]),
  );

  const rendered = normalizedTemplateSource.replace(
    /{{\s*([^{}]+?)\s*}}|<<\s*([^<>]+?)\s*>>/g,
    (_match, curlyToken?: string, angleToken?: string) => {
      const token = normalizePlaceholderToken(curlyToken ?? angleToken ?? "");
      const placeholderValue = placeholderLookup.get(token);
      const resolvedPlaceholder =
        placeholderValue === undefined ? null : formatResolvedPlaceholderText(token, placeholderValue);

      if (resolvedPlaceholder) {
        return systemPlaceholderTokens.has(token)
          ? resolvedPlaceholder
          : annotateInlineText(resolvedPlaceholder, "value");
      }

      const canonicalFallback = resolveCanonicalFallbackValue(token, input.canonicalAnswers ?? {});
      if (canonicalFallback) {
        return annotateInlineText(canonicalFallback, "value");
      }

      const fallback = previewFallbackCopy[token] ?? (input.isPreview ? "________________" : "");
      return input.isPreview && containsAlphabeticCharacters(fallback)
        ? annotateInlineText(fallback, "pending")
        : fallback;
    },
  );

  const normalizedLines = rendered
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => normalizeTemplateLine(line))
    .filter((line) => !shouldOmitRenderedLine(line));

  return squashBlankLines(
    transformRenderedLines(normalizedLines, {
      canonicalAnswers: input.canonicalAnswers ?? {},
      selectionCatalogs: input.selectionCatalogs ?? {},
    }),
  )
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
};

const buildRenderedPdf = async (input: {
  document: DocumentRecord;
  run: DocumentGenerationRunRecord;
  artifact: TemplateArtifactRecord;
  signers: DocumentOutputSignerRecord[];
}) => {
  const templateSource = await loadTemplateSource(input.artifact);
  const metadata = getArtifactMetadata(input.artifact);
  const templateLabel = asTrimmedString(metadata.templateLabel) || input.run.template_key;
  const placeholders = getPlaceholderValues(input.run);
  const canonicalAnswers = getCanonicalAnswers(input.run);
  const selectionCatalogs = getSelectionCatalogs(input.run);
  const isPreview = input.document.status !== "pending_signature";
  const brandAssets = await loadPdfBrandAssets();

  if (!templateSource) {
    throw new Error(
      `Template source could not be loaded for ${input.run.output_key} member-facing rendering`,
    );
  }

  const pdf = new PDFDocument({
    size: "LETTER",
    margins: PDF_PAGE_MARGINS,
    compress: false,
    info: {
      Title: `${templateLabel} - ${input.run.output_key}`,
      Author: "DARCi",
      Subject: isPreview ? "Preview legal document" : "Legal document",
    },
  });
  const fonts = registerPdfFonts(pdf, brandAssets);

  const drawPageChrome = () => {
    drawBrandHeader(pdf, {
      logo: brandAssets.logo,
      fonts,
      templateLabel,
    });

    if (isPreview) {
      applyPreviewWatermarkOverlay(pdf);
    }
  };

  let pageCount = 1;

  pdf.on("pageAdded", () => {
    pageCount += 1;
    drawPageChrome();
  });

  drawPageChrome();

  const chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => {
    pdf.on("data", (chunk: Buffer) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    pdf.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    pdf.on("error", reject);
  });

  const renderedTemplate = renderLegalTemplateText({
    templateSource,
    placeholders,
    canonicalAnswers,
    selectionCatalogs,
    isPreview,
  });

  renderTemplateBlocks(pdf, buildTemplateBlocks(renderedTemplate), fonts);

  pdf.end();

  return {
    content: await completed,
    pageCount,
    isPreview,
  };
};

export const processDocumentGenerationRun = async (input: {
  runId: string;
  rendererJobId: string;
}) => {
  const claimedRun = await claimDocumentGenerationRunById({
    runId: input.runId,
    rendererJobId: input.rendererJobId,
  });

  if (!claimedRun) {
    return null;
  }

  try {
    const document = await getDocumentById(claimedRun.document_id);
    if (!document) {
      throw new Error("Document not found for generation run");
    }

    if (!claimedRun.template_artifact_id) {
      throw new Error("Template artifact is not linked to the generation run");
    }

    const artifact = await getTemplateArtifactById(claimedRun.template_artifact_id);
    if (!artifact) {
      throw new Error("Template artifact could not be resolved");
    }

    const signers = await listDocumentOutputSigners({
      documentId: document.id,
      generationRunId: claimedRun.id,
    });

    logDocumentTrace("generation.render_started", {
      documentId: document.id,
      generationRunId: claimedRun.id,
      rendererJobId: input.rendererJobId,
      outputKey: claimedRun.output_key,
      documentKey: claimedRun.document_key,
      templateKey: claimedRun.template_key,
      templateVersion: claimedRun.template_version,
      signerCount: signers.length,
    });

    const renderedPdf = await buildRenderedPdf({
      document,
      run: claimedRun,
      artifact,
      signers,
    });
    const content = renderedPdf.content;
    const fileName = `${claimedRun.output_key}-${claimedRun.id.slice(0, 8)}.pdf`;
    const storagePath = `${document.owner_id}/${document.id}/generated/${claimedRun.id}/${fileName}`;

    await uploadGeneratedDocument({
      storagePath,
      content,
      contentType: "application/pdf",
    });

    const version = await createGeneratedDocumentVersion({
      documentId: document.id,
      generationRunId: claimedRun.id,
      storagePath,
      fileName,
      mimeType: "application/pdf",
      sizeBytes: content.byteLength,
      createdBy: document.owner_id,
    });

    if (renderedPdf.isPreview) {
      await recordAuditEvent({
        entityType: "document_version",
        entityId: version.id,
        action: "system.watermark_started",
        metadata: {
          document_id: document.id,
          document_version_id: version.id,
          watermark_text: PREVIEW_WATERMARK_TEXT,
        },
      });

      await recordAuditEvent({
        entityType: "document_version",
        entityId: version.id,
        action: "system.watermark_completed",
        metadata: {
          document_id: document.id,
          document_version_id: version.id,
          pages_watermarked: renderedPdf.pageCount,
        },
      });
    }

    const renderedRun = await updateDocumentGenerationRun(claimedRun.id, {
      status: "rendered",
      document_version_id: version.id,
      rendered_at: new Date().toISOString(),
      error_message: null,
      failure_code: null,
      failure_details_json: {},
      cancellation_reason: null,
    });

    if (document.status === "draft") {
      await updateDocument(document.id, {
        status: "pending_review",
      });

      await recordAuditEvent({
        entityType: "document",
        entityId: document.id,
        action: "system.document_ready_for_review",
        metadata: {
          document_id: document.id,
          generation_run_id: renderedRun.id,
          document_version_id: version.id,
          review_source: "generated_output",
        },
      });
    }

    await recordAuditEvent({
      entityType: "generation_run",
      entityId: renderedRun.id,
      action: "system.generation_run_render_completed",
      metadata: {
        document_id: renderedRun.document_id,
        generation_run_id: renderedRun.id,
        renderer_job_id: renderedRun.renderer_job_id,
        document_version_id: version.id,
        storage_path: storagePath,
      },
    });

    logDocumentTrace("generation.render_completed", {
      documentId: renderedRun.document_id,
      generationRunId: renderedRun.id,
      rendererJobId: renderedRun.renderer_job_id,
      outputKey: renderedRun.output_key,
      documentVersionId: version.id,
      fileName,
      storagePath,
      sizeBytes: content.byteLength,
      mimeType: "application/pdf",
      previewWatermarkApplied: renderedPdf.isPreview,
      pageCount: renderedPdf.pageCount,
    });

    return {
      run: renderedRun,
      version,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Generation run rendering failed";
    const failedRun = await updateDocumentGenerationRun(claimedRun.id, {
      status: "failed",
      failed_at: new Date().toISOString(),
      failure_code: "renderer_error",
      failure_details_json: {
        rendererJobId: input.rendererJobId,
      },
      error_message: message,
    });

    await recordAuditEvent({
      entityType: "generation_run",
      entityId: failedRun.id,
      action: "system.generation_run_failed",
      metadata: {
        document_id: failedRun.document_id,
        generation_run_id: failedRun.id,
        failure_code: failedRun.failure_code,
        error_message: failedRun.error_message,
      },
    });

    logDocumentTrace("generation.render_failed", {
      documentId: failedRun.document_id,
      generationRunId: failedRun.id,
      rendererJobId: input.rendererJobId,
      outputKey: failedRun.output_key,
      failureCode: failedRun.failure_code,
      errorMessage: failedRun.error_message,
    });

    throw error;
  }
};
