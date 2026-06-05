"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSearchParams } from "next/navigation";
import { refreshStoredAuth, useStoredAuth } from "@/lib/auth";

const apiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "http://localhost:4000";

type DocumentWorkspaceSummary = {
  workflow: {
    requestId: string | null;
    latestWorkflowStatus: string | null;
  };
  finalization: {
    latestStatus: string | null;
    isAnchored: boolean;
  };
  verification: {
    status: "unavailable" | "pending_finalization" | "ready";
    idn: string | null;
    verifyPath: string | null;
  };
};

type DocumentNextAction = {
  code: string;
  label: string;
  description: string;
  targetPath: string;
  priority: "high" | "medium" | "low";
};

type DocumentSignerSummary = {
  signers: Array<{
    signerId: string;
    role: string;
    roleLabel: string;
    name: string | null;
    status: "pending" | "signed";
    isRequired: boolean;
  }>;
  signerRoles: string[];
  pendingSignerRoles: string[];
  pendingRequiredSignatureCount: number;
};

type DocumentListItem = {
  id: string;
  idn: string | null;
  status: string | null;
  documentType: string | null;
  documentTypeLabel?: string;
  principalName?: string | null;
  jurisdiction: string | null;
  productFlowMode?: string | null;
  selectedFamilies?: string[];
  createdAt: string;
  summary: DocumentWorkspaceSummary | null;
  signerSummary?: DocumentSignerSummary;
  nextAction?: DocumentNextAction;
};

type DocumentsPayload = {
  documents: DocumentListItem[];
  pagination?: DocumentsPagination;
  facets?: DocumentFilterFacets;
};

type DocumentsPagination = {
  page: number;
  pageSize: number;
  total: number;
  pageCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
};

type DocumentFilterFacets = {
  documentTypes: string[];
  statuses: string[];
  jurisdictions: string[];
};

type DocumentsCacheEntry = {
  version: 2;
  cachedAt: number;
  documents: DocumentListItem[];
  pagination: DocumentsPagination;
  facets: DocumentFilterFacets;
};

type SignatureReminderPreview = {
  documentsRequested: number;
  documentsEligible: number;
  recipientsEligible: number;
  recipientsSkippedCooldown: number;
  documents: Array<{
    documentId: string;
    documentTypeLabel: string;
    principalName: string | null;
    pendingRecipients: Array<{
      signerId: string;
      name: string | null;
      role: string;
      roleLabel: string;
      deliveryHint: string | null;
      cooldownActive: boolean;
      nextEligibleAt: string | null;
      hasActiveInvite: boolean;
      canSend: boolean;
      skipReason: string | null;
    }>;
  }>;
};

type SignatureReminderRecipient = SignatureReminderPreview["documents"][number]["pendingRecipients"][number];

type GroupedSignatureReminderRecipient = SignatureReminderRecipient & {
  signerIds: string[];
  sendableSignerIds: string[];
  sendTargetKey: string;
  roleLabel: string;
  readyCount: number;
  totalCount: number;
};

type SignatureReminderSendResponse = {
  ok: boolean;
  summary: {
    recipientsSent: number;
    recipientsSkippedCooldown: number;
    recipientsFailed: number;
  };
};

type ReminderStatus = {
  kind: "success" | "error";
  message: string;
};

type DocumentFilters = {
  documentType: string;
  status: string;
  jurisdiction: string;
  createdFrom: string;
  createdTo: string;
};

type FilterOption = {
  label: string;
  value: string;
};

type PageSize = 10 | 20 | 100;

const pageSizeOptions: PageSize[] = [10, 20, 100];
const DOCUMENTS_CACHE_KEY_PREFIX = "darci:documents:list:v1";
const DOCUMENTS_CACHE_VERSION = 2;

type ActionIconName = "alert" | "arrowRight" | "bell" | "check" | "eye" | "pen" | "send" | "x";

const ActionIcon = ({ name, className = "h-3.5 w-3.5" }: { name: ActionIconName; className?: string }) => {
  const commonProps = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    strokeWidth: 1.8,
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "alert") {
    return (
      <svg {...commonProps}>
        <path d="M12 3 22 20H2L12 3Z" />
        <path d="M12 9v4" />
        <path d="M12 17h.01" />
      </svg>
    );
  }

  if (name === "bell") {
    return (
      <svg {...commonProps}>
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...commonProps}>
        <path d="m5 12 4 4 10-10" />
      </svg>
    );
  }

  if (name === "eye") {
    return (
      <svg {...commonProps}>
        <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" />
        <circle cx="12" cy="12" r="2.5" />
      </svg>
    );
  }

  if (name === "pen") {
    return (
      <svg {...commonProps}>
        <path d="m16 4 4 4L8 20H4v-4L16 4Z" />
        <path d="m14 6 4 4" />
      </svg>
    );
  }

  if (name === "send") {
    return (
      <svg {...commonProps}>
        <path d="M22 2 11 13" />
        <path d="m22 2-7 20-4-9-9-4 20-7Z" />
      </svg>
    );
  }

  if (name === "x") {
    return (
      <svg {...commonProps}>
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    );
  }

  return (
    <svg {...commonProps}>
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
};

const TextActionContent = ({ icon, label }: { icon: ActionIconName; label: string }) => {
  return (
    <>
      <ActionIcon name={icon} />
      <span>{label}</span>
    </>
  );
};

const fetchWithTokenRefresh = async (
  url: string,
  accessToken: string,
  init?: RequestInit,
) => {
  const requestWithToken = (token: string) => {
    const headers = new Headers(init?.headers ?? {});
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(url, {
      ...init,
      headers,
    });
  };

  const response = await requestWithToken(accessToken);
  if (response.status !== 401) {
    return response;
  }

  try {
    const refreshed = await refreshStoredAuth();
    if (!refreshed?.accessToken) {
      return response;
    }

    return requestWithToken(refreshed.accessToken);
  } catch {
    return response;
  }
};

const createDocumentsPagination = (page: number, pageSize: number, total: number): DocumentsPagination => {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return {
    page,
    pageSize,
    total,
    pageCount,
    hasPreviousPage: page > 1,
    hasNextPage: page < pageCount,
  };
};

const createEmptyDocumentFilterFacets = (): DocumentFilterFacets => ({
  documentTypes: [],
  statuses: [],
  jurisdictions: [],
});

const getDocumentsCacheKey = (
  userId: string | null | undefined,
  role: string | null | undefined,
  queryString: string,
) => {
  if (!userId) {
    return null;
  }

  return `${DOCUMENTS_CACHE_KEY_PREFIX}:${userId}:${role ?? "member"}:${queryString}`;
};

const isDocumentListItemArray = (value: unknown): value is DocumentListItem[] => {
  return Array.isArray(value) && value.every((item) => {
    return Boolean(
      item &&
        typeof item === "object" &&
        "id" in item &&
        typeof item.id === "string" &&
        "createdAt" in item &&
        typeof item.createdAt === "string",
    );
  });
};

const isDocumentsPagination = (value: unknown): value is DocumentsPagination => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "page" in value &&
      typeof value.page === "number" &&
      "pageSize" in value &&
      typeof value.pageSize === "number" &&
      "total" in value &&
      typeof value.total === "number" &&
      "pageCount" in value &&
      typeof value.pageCount === "number" &&
      "hasPreviousPage" in value &&
      typeof value.hasPreviousPage === "boolean" &&
      "hasNextPage" in value &&
      typeof value.hasNextPage === "boolean",
  );
};

const isStringArray = (value: unknown): value is string[] => {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
};

const isDocumentFilterFacets = (value: unknown): value is DocumentFilterFacets => {
  return Boolean(
    value &&
      typeof value === "object" &&
      "documentTypes" in value &&
      isStringArray(value.documentTypes) &&
      "statuses" in value &&
      isStringArray(value.statuses) &&
      "jurisdictions" in value &&
      isStringArray(value.jurisdictions),
  );
};

const readDocumentsCache = (cacheKey: string): DocumentsCacheEntry | null => {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const raw = window.sessionStorage.getItem(cacheKey);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw) as Partial<DocumentsCacheEntry> | null;
    if (
      !parsed ||
      parsed.version !== DOCUMENTS_CACHE_VERSION ||
      !isDocumentListItemArray(parsed.documents) ||
      !isDocumentsPagination(parsed.pagination) ||
      !isDocumentFilterFacets(parsed.facets)
    ) {
      window.sessionStorage.removeItem(cacheKey);
      return null;
    }

    return {
      version: DOCUMENTS_CACHE_VERSION,
      cachedAt: typeof parsed.cachedAt === "number" ? parsed.cachedAt : 0,
      documents: parsed.documents,
      pagination: parsed.pagination,
      facets: parsed.facets,
    };
  } catch {
    window.sessionStorage.removeItem(cacheKey);
    return null;
  }
};

const writeDocumentsCache = (
  cacheKey: string,
  documents: DocumentListItem[],
  pagination: DocumentsPagination,
  facets: DocumentFilterFacets,
) => {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      cacheKey,
      JSON.stringify({
        version: DOCUMENTS_CACHE_VERSION,
        cachedAt: Date.now(),
        documents,
        pagination,
        facets,
      } satisfies DocumentsCacheEntry),
    );
  } catch {
    // Cache writes are best-effort; the network response remains authoritative.
  }
};

const formatDateTime = (value: string | null) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString();
};

const toTitleWords = (value: string) => {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[._-]+/g, " ")
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 0)
    .map((token) => token.charAt(0).toUpperCase() + token.slice(1).toLowerCase())
    .join(" ");
};

const formatStatusLabel = (value: string | null) => {
  if (!value || value.trim().length === 0) {
    return "Unknown";
  }

  return toTitleWords(value);
};

const getStatusBadgeClass = (value: string | null) => {
  const normalized = normalizeFilterText(value);

  if (normalized.includes("ready")) {
    return "bg-Green text-Color-Neutral-Darkest";
  }

  if (normalized.includes("signature") || normalized.includes("sign")) {
    return "bg-Color-White text-Color-Neutral-Darkest";
  }

  if (normalized.includes("review") || normalized.includes("blocked")) {
    return "bg-Color-Neutral-Lighter text-Color-Scheme-1-Text";
  }

  if (normalized.includes("draft")) {
    return "bg-Color-Neutral-Lighter text-Color-Neutral-Darkest";
  }

  if (normalized.includes("intake")) {
    return "bg-Color-Neutral-Lightest text-Color-Neutral-Darkest";
  }

  if (normalized.includes("complete") || normalized.includes("notar") || normalized.includes("final")) {
    return "bg-Color-Neutral-Lighter text-Color-Neutral-Darkest";
  }

  return "bg-Color-White text-Color-Neutral-Darkest";
};

const formatReference = (value: string, prefix: string) => {
  const compact = value.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
  const sliced = compact.length >= 8 ? compact.slice(0, 8) : compact;
  return `${prefix}-${sliced}`;
};

const resolveFriendlyDocumentType = (
  value: string | null | undefined,
  selectedFamilies?: string[] | null,
  productFlowMode?: string | null,
) => {
  const normalizedFamilies = (selectedFamilies ?? []).map((entry) => entry.toLowerCase());

  if (normalizedFamilies.includes("trust")) {
    return "Trust";
  }

  if (normalizedFamilies.includes("poa")) {
    return "POA";
  }

  if (normalizedFamilies.includes("idn")) {
    return "Document notarization";
  }

  const normalizedFlowMode = (productFlowMode ?? "").toLowerCase();
  if (normalizedFlowMode.includes("trust")) {
    return "Trust";
  }

  if (normalizedFlowMode.includes("poa")) {
    return "POA";
  }

  if (normalizedFlowMode.includes("idn") || normalizedFlowMode.includes("notar")) {
    return "Document notarization";
  }

  const normalized = (value ?? "").toLowerCase();

  if (normalized.includes("poa") || normalized.includes("power")) {
    return "POA";
  }

  if (normalized.includes("trust")) {
    return "Trust";
  }

  if (normalized.includes("notar") || normalized.includes("idn")) {
    return "Document notarization";
  }

  if (normalized === "generic" || normalized.includes("uploaded")) {
    return "Document";
  }

  if (normalized.length === 0) {
    return "Document";
  }

  return toTitleWords(normalized);
};

const getDocumentTypeLabel = (document: DocumentListItem) => {
  return (
    document.documentTypeLabel ??
    resolveFriendlyDocumentType(
      document.documentType,
      document.selectedFamilies,
      document.productFlowMode,
    )
  );
};

const formatDocumentTitle = (document: DocumentListItem) => {
  return getDocumentTypeLabel(document);
};

const normalizeFilterText = (value: string | null | undefined) => {
  return value?.trim().toLowerCase() ?? "";
};

const normalizeName = (value: string | null | undefined) => {
  return normalizeFilterText(value).replace(/[^a-z0-9]+/g, " ").trim();
};

const isPrincipalLikeRole = (role: string) => {
  const normalized = normalizeFilterText(role);
  return ["principal", "grantor", "trustmaker", "trustee"].includes(normalized);
};

const isGenericPersonLabel = (value: string | null | undefined) => {
  const normalized = normalizeName(value);
  return ["", "principal", "grantor", "trustmaker", "trustee", "signer"].includes(normalized);
};

const resolvePrincipalDisplayName = (value: string | null | undefined, fallbackName: string) => {
  const trimmedValue = value?.trim() ?? "";
  if (trimmedValue && !isGenericPersonLabel(trimmedValue)) {
    return trimmedValue;
  }

  const trimmedFallback = fallbackName.trim();
  if (trimmedFallback && !isGenericPersonLabel(trimmedFallback)) {
    return trimmedFallback;
  }

  return "Not assigned";
};

const getDocumentPrincipalDisplayName = (document: DocumentListItem, fallbackName: string) => {
  const directName = resolvePrincipalDisplayName(document.principalName, "");
  if (directName !== "Not assigned") {
    return directName;
  }

  const signerName = document.signerSummary?.signers.find(
    (signer) => isPrincipalLikeRole(signer.role) && !isGenericPersonLabel(signer.name),
  )?.name;

  return resolvePrincipalDisplayName(signerName, fallbackName);
};

const documentHasCurrentUserPendingSignature = (
  document: DocumentListItem,
  currentUserName: string,
) => {
  const normalizedUserName = normalizeName(currentUserName);
  if (!normalizedUserName) {
    return false;
  }

  const normalizedPrincipalName = normalizeName(document.principalName);
  const pendingSigners = (document.signerSummary?.signers ?? []).filter(
    (signer) => signer.isRequired && signer.status === "pending",
  );

  return pendingSigners.some((signer) => {
    const signerName = normalizeName(signer.name);
    if (signerName && signerName === normalizedUserName) {
      return true;
    }

    if (normalizedPrincipalName !== normalizedUserName) {
      return false;
    }

    return (
      (signerName && signerName === normalizedPrincipalName) ||
      (!signerName && isPrincipalLikeRole(signer.role)) ||
      isPrincipalLikeRole(signer.role)
    );
  });
};

const getDocumentActionLabel = (document: DocumentListItem, currentUserName: string) => {
  if (
    document.nextAction?.code === "collect_signatures" &&
    !documentHasCurrentUserPendingSignature(document, currentUserName)
  ) {
    return "View Document";
  }

  return document.nextAction?.label ?? "Open";
};

const getDocumentActionIconName = (document: DocumentListItem, currentUserName: string): ActionIconName => {
  const label = getDocumentActionLabel(document, currentUserName).toLowerCase();

  if (label.includes("fix") || label.includes("blocker")) {
    return "alert";
  }

  if (label.includes("sign")) {
    return "pen";
  }

  if (label.includes("view") || label.includes("open")) {
    return "eye";
  }

  return "arrowRight";
};

const getDocumentActionClass = (document: DocumentListItem, currentUserName: string) => {
  void document;
  void currentUserName;
  return "inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline";
};

const getDocumentActionHref = (document: DocumentListItem) => {
  if (document.nextAction?.targetPath) {
    return document.nextAction.targetPath;
  }

  const status = (document.status ?? "").toLowerCase();

  if (status.includes("draft") || status.includes("intake")) {
    return `/app/start?documentId=${encodeURIComponent(document.id)}`;
  }

  if (status.includes("review") || status.includes("blocked") || status.includes("approve")) {
    return `/app/review?documentId=${encodeURIComponent(document.id)}`;
  }

  if ((document.signerSummary?.pendingRequiredSignatureCount ?? 0) > 0) {
    return `/app/sign?documentId=${encodeURIComponent(document.id)}`;
  }

  if (
    status.includes("signature") ||
    status.includes("sign") ||
    status.includes("final") ||
    status.includes("complete") ||
    status.includes("issued")
  ) {
    return `/app/sign?documentId=${encodeURIComponent(document.id)}`;
  }

  return `/app/review?documentId=${encodeURIComponent(document.id)}`;
};

const inferDocumentNextStep = (document: DocumentListItem) => {
  if (document.nextAction?.description) {
    return document.nextAction.description;
  }

  const status = (document.status ?? "").toLowerCase();
  const workflowStatus = (document.summary?.workflow.latestWorkflowStatus ?? "").toLowerCase();
  const verificationStatus = document.summary?.verification.status ?? "unavailable";

  if (status.includes("draft") || status.includes("intake")) {
    return "Continue intake and submit for review.";
  }

  if (workflowStatus.includes("pending") || workflowStatus.includes("requested")) {
    return "Track the active request and wait for processing updates.";
  }

  if (verificationStatus === "ready") {
    return "Verify the finalized record and share the IDN if needed.";
  }

  if (status.includes("signed") || status.includes("final") || status.includes("complete")) {
    return "Download the finalized document and share with stakeholders.";
  }

  return "Open the document workspace for the latest action.";
};

const formatReminderSkipReason = (value: string | null) => {
  if (value === "missing_email") {
    return "Missing email";
  }

  if (value === "cooldown_active") {
    return "Recently reminded";
  }

  if (value === "invite_status_not_resendable") {
    return "Not eligible";
  }

  return value ? toTitleWords(value) : "Ready";
};

const normalizeReminderSignerIds = (signerIds?: string | string[]) => {
  return (Array.isArray(signerIds) ? signerIds : signerIds ? [signerIds] : [])
    .map((signerId) => signerId.trim())
    .filter((signerId) => signerId.length > 0)
    .sort();
};

const getReminderSendTargetKey = (signerIds?: string | string[]) => {
  const normalizedSignerIds = normalizeReminderSignerIds(signerIds);
  return normalizedSignerIds.length > 0 ? normalizedSignerIds.join("|") : "all";
};

const createIdempotencyKey = (documentId: string, signerIds?: string | string[]) => {
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
  return `web-signature-reminder:${documentId}:${getReminderSendTargetKey(signerIds)}:${token}`;
};

const getReminderRecipientGroupKey = (recipient: SignatureReminderRecipient) => {
  const deliveryKey = recipient.deliveryHint?.trim().toLowerCase() ?? "";
  const nameKey = normalizeName(recipient.name);

  if (deliveryKey) {
    return `email:${deliveryKey}`;
  }

  if (nameKey) {
    return `name:${nameKey}`;
  }

  return recipient.signerId;
};

const getEarliestDateValue = (values: Array<string | null>) => {
  return values
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .sort()
    .at(0) ?? null;
};

const groupReminderRecipients = (
  recipients: SignatureReminderRecipient[],
): GroupedSignatureReminderRecipient[] => {
  const groupedRecipients = new Map<string, SignatureReminderRecipient[]>();

  for (const recipient of recipients) {
    const groupKey = getReminderRecipientGroupKey(recipient);
    groupedRecipients.set(groupKey, [...(groupedRecipients.get(groupKey) ?? []), recipient]);
  }

  return Array.from(groupedRecipients.values()).map((group) => {
    const representative = group[0]!;
    const signerIds = group.map((recipient) => recipient.signerId);
    const sendableSignerIds = group
      .filter((recipient) => recipient.canSend)
      .map((recipient) => recipient.signerId);
    const uniqueRoleLabels = Array.from(new Set(group.map((recipient) => recipient.roleLabel)));
    const nextEligibleAt = getEarliestDateValue(group.map((recipient) => recipient.nextEligibleAt));
    const skipReason = group.find((recipient) => recipient.skipReason)?.skipReason ?? null;

    return {
      ...representative,
      signerIds,
      sendableSignerIds,
      sendTargetKey: getReminderSendTargetKey(sendableSignerIds),
      role: Array.from(new Set(group.map((recipient) => recipient.role))).join(", "),
      roleLabel: `${uniqueRoleLabels.join(", ")}${group.length > 1 ? ` (${group.length})` : ""}`,
      cooldownActive: group.every((recipient) => recipient.cooldownActive),
      nextEligibleAt,
      hasActiveInvite: group.some((recipient) => recipient.hasActiveInvite),
      canSend: sendableSignerIds.length > 0,
      skipReason,
      readyCount: sendableSignerIds.length,
      totalCount: group.length,
    };
  });
};

const matchesStatusFilter = (document: DocumentListItem, statusFilter: string) => {
  if (!statusFilter) {
    return true;
  }

  const status = (document.status ?? "").toLowerCase();
  return status === statusFilter || status.includes(statusFilter);
};

const dateInputToStart = (value: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const dateInputToEnd = (value: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T23:59:59.999`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const parseDateFilterValue = (value: string) => {
  if (!value) {
    return null;
  }

  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatDateFilterValue = (value: string) => {
  const parsed = parseDateFilterValue(value);
  if (!parsed) {
    return "Any date";
  }

  return parsed.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
};

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const getMonthStart = (date: Date) => {
  return new Date(date.getFullYear(), date.getMonth(), 1);
};

const addMonths = (date: Date, amount: number) => {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
};

const getCalendarDays = (visibleMonth: Date) => {
  const firstOfMonth = getMonthStart(visibleMonth);
  const firstVisibleDate = new Date(firstOfMonth);
  firstVisibleDate.setDate(firstOfMonth.getDate() - firstOfMonth.getDay());

  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(firstVisibleDate);
    date.setDate(firstVisibleDate.getDate() + index);
    return date;
  });
};

const SelectFilterControl = ({
  label,
  value,
  placeholder,
  options,
  isOpen,
  onChange,
  onOpenChange,
}: {
  label: string;
  value: string;
  placeholder: string;
  options: FilterOption[];
  isOpen: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const selectedOption = options.find((option) => option.value === value);

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }

    const popoverWidth = 288;
    const leftBoundary = 16;
    const rightBoundary = window.innerWidth - popoverWidth - leftBoundary;
    setPopoverPosition({
      left: Math.max(leftBoundary, Math.min(triggerRect.left, rightBoundary)),
      top: triggerRect.bottom + 8,
    });
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- measure trigger position after the popover opens.
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const portalTarget = typeof document === "undefined" ? null : document.body;
  const selectPopover =
    isOpen && popoverPosition && portalTarget
      ? createPortal(
          <div
            className="fixed z-[100] max-h-72 w-72 overflow-y-auto rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-2 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
          >
            {options.map((option) => {
              const isSelected = option.value === value;

              return (
                <button
                  key={option.value || option.label}
                  type="button"
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-xs transition-colors ${
                    isSelected
                      ? "bg-Green text-Color-Neutral-Darkest"
                      : "text-Color-Scheme-1-Text hover:bg-Color-White"
                  }`}
                  onClick={() => {
                    onChange(option.value);
                    onOpenChange(false);
                    triggerRef.current?.blur();
                  }}
                >
                  <span>{option.label}</span>
                  {isSelected ? <ActionIcon name="check" className="h-3 w-3" /> : null}
                </button>
              );
            })}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
      <span>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-left text-xs text-Color-Scheme-1-Text outline-none transition-colors hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) {
            updatePopoverPosition();
          }
          onOpenChange(!isOpen);
        }}
      >
        <span className={selectedOption ? undefined : "text-Color-Neutral"}>{selectedOption?.label ?? placeholder}</span>
        <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 border-b border-r border-Color-Neutral" />
      </button>
      {selectPopover}
    </div>
  );
};

const DateFilterControl = ({
  label,
  value,
  isOpen,
  onChange,
  onOpenChange,
}: {
  label: string;
  value: string;
  isOpen: boolean;
  onChange: (value: string) => void;
  onOpenChange: (isOpen: boolean) => void;
}) => {
  const selectedDate = parseDateFilterValue(value);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [visibleMonth, setVisibleMonth] = useState(() => getMonthStart(selectedDate ?? new Date()));
  const [popoverPosition, setPopoverPosition] = useState<{ left: number; top: number } | null>(null);
  const days = useMemo(() => getCalendarDays(visibleMonth), [visibleMonth]);

  const updatePopoverPosition = useCallback(() => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    if (!triggerRect) {
      return;
    }

    const popoverWidth = 288;
    const leftBoundary = 16;
    const rightBoundary = window.innerWidth - popoverWidth - leftBoundary;
    setPopoverPosition({
      left: Math.max(leftBoundary, Math.min(triggerRect.left, rightBoundary)),
      top: triggerRect.bottom + 8,
    });
  }, []);

  useEffect(() => {
    const nextSelectedDate = parseDateFilterValue(value);
    if (nextSelectedDate) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- keep the calendar month aligned to the selected filter date.
      setVisibleMonth(getMonthStart(nextSelectedDate));
    }
  }, [value]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    // eslint-disable-next-line react-hooks/set-state-in-effect -- measure trigger position after the popover opens.
    updatePopoverPosition();
    window.addEventListener("resize", updatePopoverPosition);
    window.addEventListener("scroll", updatePopoverPosition, true);

    return () => {
      window.removeEventListener("resize", updatePopoverPosition);
      window.removeEventListener("scroll", updatePopoverPosition, true);
    };
  }, [isOpen, updatePopoverPosition]);

  const selectedKey = selectedDate ? formatDateKey(selectedDate) : null;
  const currentMonth = visibleMonth.getMonth();
  const monthLabel = visibleMonth.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const portalTarget = typeof document === "undefined" ? null : document.body;
  const calendarPopover =
    isOpen && popoverPosition && portalTarget
      ? createPortal(
          <div
            className="fixed z-[100] w-72 rounded-xl border border-Color-Scheme-1-Border/60 bg-Color-Neutral-Lightest p-4 shadow-[0_20px_48px_rgba(0,0,0,0.14)]"
            style={{ left: popoverPosition.left, top: popoverPosition.top }}
          >
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White transition-colors hover:bg-Color-Neutral-Lightest/70"
                aria-label="Previous month"
                onClick={() => setVisibleMonth((current) => addMonths(current, -1))}
              >
                <span aria-hidden="true" className="h-2 w-2 rotate-[135deg] border-b border-r border-Color-Neutral-Darkest" />
              </button>
              <div className="text-sm font-medium text-Color-Scheme-1-Text">{monthLabel}</div>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White transition-colors hover:bg-Color-Neutral-Lightest/70"
                aria-label="Next month"
                onClick={() => setVisibleMonth((current) => addMonths(current, 1))}
              >
                <span aria-hidden="true" className="h-2 w-2 -rotate-45 border-b border-r border-Color-Neutral-Darkest" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-7 gap-1.5 text-center text-[11px] uppercase text-Color-Neutral">
              {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((day) => (
                <div key={day}>{day}</div>
              ))}
            </div>
            <div className="mt-2 grid grid-cols-7 gap-1.5">
              {days.map((day) => {
                const dayKey = formatDateKey(day);
                const isSelected = dayKey === selectedKey;
                const isMuted = day.getMonth() !== currentMonth;

                return (
                  <button
                    key={dayKey}
                    type="button"
                    className={`h-8 rounded-md border text-xs transition-colors ${
                      isSelected
                        ? "border-Color-Neutral-Darkest bg-Color-Neutral-Darkest text-Color-White"
                        : "border-transparent bg-Color-White/70 hover:border-Color-Scheme-1-Border/60 hover:bg-Color-White"
                    } ${isMuted ? "text-Color-Neutral" : "text-Color-Scheme-1-Text"}`}
                    onClick={() => {
                      onChange(dayKey);
                      onOpenChange(false);
                      triggerRef.current?.blur();
                    }}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            {value ? (
              <button
                type="button"
                className="mt-4 w-full rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-2 py-2 text-xs text-Color-Neutral-Darkest transition-colors hover:bg-Color-Neutral-Lightest/70"
                onClick={() => {
                  onChange("");
                  onOpenChange(false);
                  triggerRef.current?.blur();
                }}
              >
                Clear date
              </button>
            ) : null}
          </div>,
          portalTarget,
        )
      : null;

  return (
    <div className="flex flex-col gap-2 text-xs font-medium text-Color-Neutral-Darkest">
      <span>{label}</span>
      <button
        ref={triggerRef}
        type="button"
        className="flex h-9 w-full items-center justify-between rounded-md border border-Color-Scheme-1-Border/50 bg-Color-White px-3 text-left text-xs text-Color-Scheme-1-Text outline-none transition-colors hover:bg-Color-Neutral-Lightest/50 focus-visible:border-Color-Scheme-1-Text"
        aria-expanded={isOpen}
        onClick={() => {
          if (!isOpen) {
            updatePopoverPosition();
          }
          onOpenChange(!isOpen);
        }}
      >
        <span>{formatDateFilterValue(value)}</span>
        <span aria-hidden="true" className="h-1.5 w-1.5 rotate-45 border-b border-r border-Color-Neutral" />
      </button>
      {calendarPopover}
    </div>
  );
};

const matchesDocumentFilters = (document: DocumentListItem, filters: DocumentFilters) => {
  if (filters.documentType && normalizeFilterText(document.documentType) !== normalizeFilterText(filters.documentType)) {
    return false;
  }

  if (!matchesStatusFilter(document, filters.status)) {
    return false;
  }

  if (filters.jurisdiction && normalizeFilterText(document.jurisdiction) !== filters.jurisdiction) {
    return false;
  }

  const createdAt = new Date(document.createdAt);
  if (Number.isNaN(createdAt.getTime())) {
    return true;
  }

  const createdFrom = dateInputToStart(filters.createdFrom);
  if (createdFrom && createdAt < createdFrom) {
    return false;
  }

  const createdTo = dateInputToEnd(filters.createdTo);
  if (createdTo && createdAt > createdTo) {
    return false;
  }

  return true;
};

export default function DocumentsPage() {
  const { accessToken, user } = useStoredAuth();
  const searchParams = useSearchParams();
  const requestedStatusFilter = searchParams.get("status")?.trim().toLowerCase() || "";
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [filters, setFilters] = useState<DocumentFilters>(() => ({
    documentType: "",
    status: requestedStatusFilter,
    jurisdiction: "",
    createdFrom: "",
    createdTo: "",
  }));
  const [pageSize, setPageSize] = useState<PageSize>(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [pagination, setPagination] = useState<DocumentsPagination>(() => createDocumentsPagination(1, 10, 0));
  const [facets, setFacets] = useState<DocumentFilterFacets>(() => createEmptyDocumentFilterFacets());
  const [openFilterId, setOpenFilterId] = useState<string | null>(null);
  const [reminderDocumentId, setReminderDocumentId] = useState<string | null>(null);
  const [reminderPreview, setReminderPreview] = useState<SignatureReminderPreview | null>(null);
  const [reminderStatus, setReminderStatus] = useState<ReminderStatus | null>(null);
  const [reminderSendTarget, setReminderSendTarget] = useState<"all" | string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isUsingCachedDocuments, setIsUsingCachedDocuments] = useState(false);
  const [isReminderLoading, setIsReminderLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const currentUserName = [user?.firstName, user?.lastName].filter(Boolean).join(" ").trim();
  const documentsQueryString = useMemo(() => {
    const params = new URLSearchParams({
      page: String(currentPage),
      pageSize: String(pageSize),
    });

    if (filters.documentType) {
      params.set("documentType", filters.documentType);
    }

    if (filters.status) {
      params.set("status", filters.status);
    }

    if (filters.jurisdiction) {
      params.set("jurisdiction", filters.jurisdiction);
    }

    if (filters.createdFrom) {
      params.set("createdFrom", filters.createdFrom);
    }

    if (filters.createdTo) {
      params.set("createdTo", filters.createdTo);
    }

    return params.toString();
  }, [currentPage, filters.createdFrom, filters.createdTo, filters.documentType, filters.jurisdiction, filters.status, pageSize]);
  const documentsCacheKey = useMemo(
    () => getDocumentsCacheKey(user?.id, user?.role, documentsQueryString),
    [documentsQueryString, user?.id, user?.role],
  );
  const principalDisplayName = resolvePrincipalDisplayName(null, currentUserName);
  const isReminderSending = reminderSendTarget !== null;

  useEffect(() => {
    setCurrentPage(1);
    setFilters((currentFilters) => {
      if (currentFilters.status === requestedStatusFilter) {
        return currentFilters;
      }

      return {
        ...currentFilters,
        status: requestedStatusFilter,
      };
    });
  }, [requestedStatusFilter]);

  const loadDocuments = useCallback(async () => {
    if (!accessToken) {
      setDocuments([]);
      setPagination(createDocumentsPagination(1, pageSize, 0));
      setFacets(createEmptyDocumentFilterFacets());
      setIsUsingCachedDocuments(false);
      setReminderDocumentId(null);
      setReminderPreview(null);
      setReminderStatus(null);
      return;
    }

    const cached = documentsCacheKey ? readDocumentsCache(documentsCacheKey) : null;
    let servedCachedDocuments = false;
    if (cached) {
      setDocuments(cached.documents);
      setPagination(cached.pagination);
      setFacets(cached.facets);
      setIsUsingCachedDocuments(true);
      setErrorMessage(null);
      servedCachedDocuments = true;
    }

    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`${apiBaseUrl}/documents?${documentsQueryString}`, accessToken, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as DocumentsPayload | null;

      if (!response.ok || !payload?.documents) {
        throw new Error("Failed to load documents.");
      }

      const nextPagination = payload.pagination ?? createDocumentsPagination(currentPage, pageSize, payload.documents.length);
      const nextFacets = payload.facets ?? createEmptyDocumentFilterFacets();
      setDocuments(payload.documents);
      setPagination(nextPagination);
      setFacets(nextFacets);
      setIsUsingCachedDocuments(false);
      if (documentsCacheKey) {
        writeDocumentsCache(documentsCacheKey, payload.documents, nextPagination, nextFacets);
      }
      setErrorMessage(null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Failed to load documents.");
      if (!servedCachedDocuments) {
        setDocuments([]);
        setPagination(createDocumentsPagination(currentPage, pageSize, 0));
        setIsUsingCachedDocuments(false);
      }
    } finally {
      setIsLoading(false);
    }
  }, [accessToken, currentPage, documentsCacheKey, documentsQueryString, pageSize]);

  const previewReminders = useCallback(async (document: DocumentListItem) => {
    if (!accessToken) {
      return;
    }

    setReminderDocumentId(document.id);
    setReminderPreview(null);
    setReminderStatus(null);
    setIsReminderLoading(true);
    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${document.id}/signature-reminders/preview`,
        accessToken,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const payload = (await response.json().catch(() => null)) as SignatureReminderPreview | { message?: string } | null;

      if (!response.ok || !payload || !("documents" in payload)) {
        throw new Error(payload && "message" in payload && payload.message ? payload.message : "Failed to preview reminders.");
      }

      setReminderPreview(payload);
    } catch (error) {
      setReminderStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to preview reminders.",
      });
    } finally {
      setIsReminderLoading(false);
    }
  }, [accessToken]);

  const sendReminders = useCallback(async (signerIds?: string | string[]) => {
    if (!accessToken || !reminderDocumentId) {
      return;
    }

    const normalizedSignerIds = normalizeReminderSignerIds(signerIds);
    setReminderSendTarget(getReminderSendTargetKey(normalizedSignerIds));
    setReminderStatus(null);
    try {
      const response = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${reminderDocumentId}/signature-reminders`,
        accessToken,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": createIdempotencyKey(reminderDocumentId, normalizedSignerIds),
          },
          body: JSON.stringify(normalizedSignerIds.length > 0 ? { signerIds: normalizedSignerIds } : {}),
        },
      );
      const payload = (await response.json().catch(() => null)) as SignatureReminderSendResponse | { message?: string } | null;

      if (!response.ok || !payload || !("summary" in payload)) {
        throw new Error(payload && "message" in payload && payload.message ? payload.message : "Failed to send reminders.");
      }

      setReminderStatus({
        kind: "success",
        message: `${payload.summary.recipientsSent} reminder(s) queued.`,
      });
      await loadDocuments();
      const previewResponse = await fetchWithTokenRefresh(
        `${apiBaseUrl}/documents/${reminderDocumentId}/signature-reminders/preview`,
        accessToken,
        {
          method: "POST",
          cache: "no-store",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        },
      );
      const previewPayload = (await previewResponse.json().catch(() => null)) as SignatureReminderPreview | null;
      if (previewResponse.ok && previewPayload?.documents) {
        setReminderPreview(previewPayload);
      }
    } catch (error) {
      setReminderStatus({
        kind: "error",
        message: error instanceof Error ? error.message : "Failed to send reminders.",
      });
    } finally {
      setReminderSendTarget(null);
    }
  }, [accessToken, loadDocuments, reminderDocumentId]);

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  const reminderPreviewDocument = reminderPreview?.documents[0] ?? null;
  const groupedReminderRecipients = useMemo(
    () => groupReminderRecipients(reminderPreviewDocument?.pendingRecipients ?? []),
    [reminderPreviewDocument?.pendingRecipients],
  );
  const reminderReadyRecipientCount =
    groupedReminderRecipients.filter((recipient) => recipient.canSend).length;
  const canSendReminder = reminderReadyRecipientCount > 0;
  const reminderPreviewPrincipalName = reminderPreviewDocument
    ? resolvePrincipalDisplayName(reminderPreviewDocument.principalName, currentUserName)
    : null;
  const filteredDocuments = useMemo(() => {
    return documents.filter((document) => matchesDocumentFilters(document, filters));
  }, [documents, filters]);
  const pageCount = pagination.pageCount;
  const activePage = Math.min(pagination.page, pageCount);
  const paginatedDocuments = filteredDocuments;
  const pageStart = pagination.total === 0 || paginatedDocuments.length === 0 ? 0 : (activePage - 1) * pagination.pageSize + 1;
  const pageEnd = pagination.total === 0 ? 0 : Math.min(pageStart + paginatedDocuments.length - 1, pagination.total);

  useEffect(() => {
    setCurrentPage(1);
  }, [filters, pageSize]);

  useEffect(() => {
    setCurrentPage((page) => Math.min(page, pageCount));
  }, [pageCount]);

  const documentTypeOptions = useMemo(() => {
    return facets.documentTypes;
  }, [facets.documentTypes]);
  const statusOptions = useMemo(() => {
    return facets.statuses;
  }, [facets.statuses]);
  const jurisdictionOptions = useMemo(() => {
    return facets.jurisdictions;
  }, [facets.jurisdictions]);
  const hasActiveFilters = Object.values(filters).some((value) => value.length > 0);
  const documentMetrics = useMemo(() => {
    return {
      total: pagination.total,
      filtered: pagination.total,
      pendingSignature: paginatedDocuments.filter(
        (document) => (document.signerSummary?.pendingRequiredSignatureCount ?? 0) > 0,
      ).length,
      ready: paginatedDocuments.filter((document) => {
        const status = normalizeFilterText(document.status);
        return status.includes("complete") || status.includes("notar") || status.includes("final");
      }).length,
    };
  }, [paginatedDocuments, pagination.total]);

  return (
    <div className="space-y-14">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1">
          <div className="text-2xl font-medium">Documents</div>
          <div className="text-sm text-Color-Neutral">
            Review document status, signer progress, and reminder eligibility in one place.
          </div>
        </div>
        <div className="grid min-w-[320px] grid-cols-3 overflow-hidden rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest text-sm">
          <div className="border-r border-Color-Scheme-1-Border/40 px-3 py-2">
            <div className="text-xs text-Color-Neutral">Showing</div>
            <div className="mt-1 font-medium">{documentMetrics.filtered}/{documentMetrics.total}</div>
          </div>
          <div className="border-r border-Color-Scheme-1-Border/40 px-3 py-2">
            <div className="text-xs text-Color-Neutral">Needs signing</div>
            <div className="mt-1 font-medium">{documentMetrics.pendingSignature}</div>
          </div>
          <div className="px-3 py-2">
            <div className="text-xs text-Color-Neutral">Ready</div>
            <div className="mt-1 font-medium">{documentMetrics.ready}</div>
          </div>
        </div>
      </div>

      {errorMessage ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {errorMessage}
        </div>
      ) : null}

      {isLoading && documents.length > 0 ? (
        <div className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/70 px-4 py-3 text-sm text-Color-Neutral">
          {isUsingCachedDocuments ? "Showing cached documents while refreshing." : "Refreshing documents."}
        </div>
      ) : null}

      <div className="rounded-lg border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/70">
        <div className="relative z-20 grid gap-4 overflow-visible border-b border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/45 p-4 md:grid-cols-[1fr_1fr_1fr_1fr_1fr_auto]">
          <SelectFilterControl
            label="Document type"
            value={filters.documentType}
            placeholder="All types"
            isOpen={openFilterId === "documentType"}
            options={[
              { label: "All types", value: "" },
              ...documentTypeOptions.map((documentType) => ({
                label: resolveFriendlyDocumentType(documentType, null, null),
                value: documentType,
              })),
            ]}
            onChange={(value) =>
              {
                setCurrentPage(1);
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  documentType: value,
                }));
              }
            }
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "documentType" : null)}
          />
          <SelectFilterControl
            label="Status"
            value={filters.status}
            placeholder="All statuses"
            isOpen={openFilterId === "status"}
            options={[
              { label: "All statuses", value: "" },
              ...statusOptions.map((status) => ({
                label: formatStatusLabel(status),
                value: normalizeFilterText(status),
              })),
            ]}
            onChange={(value) =>
              {
                setCurrentPage(1);
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  status: value,
                }));
              }
            }
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "status" : null)}
          />
          <SelectFilterControl
            label="Jurisdiction"
            value={filters.jurisdiction}
            placeholder="All jurisdictions"
            isOpen={openFilterId === "jurisdiction"}
            options={[
              { label: "All jurisdictions", value: "" },
              ...jurisdictionOptions.map((jurisdiction) => ({
                label: jurisdiction.toUpperCase(),
                value: normalizeFilterText(jurisdiction),
              })),
            ]}
            onChange={(value) =>
              {
                setCurrentPage(1);
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  jurisdiction: value,
                }));
              }
            }
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "jurisdiction" : null)}
          />
          <DateFilterControl
            label="Created from"
            value={filters.createdFrom}
            isOpen={openFilterId === "createdFrom"}
            onChange={(value) =>
              {
                setCurrentPage(1);
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  createdFrom: value,
                }));
              }
            }
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "createdFrom" : null)}
          />
          <DateFilterControl
            label="Created to"
            value={filters.createdTo}
            isOpen={openFilterId === "createdTo"}
            onChange={(value) =>
              {
                setCurrentPage(1);
                setFilters((currentFilters) => ({
                  ...currentFilters,
                  createdTo: value,
                }));
              }
            }
            onOpenChange={(isOpen) => setOpenFilterId(isOpen ? "createdTo" : null)}
          />
          <div className="flex items-end">
            <button
              type="button"
              className="inline-flex h-9 items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!hasActiveFilters}
              onClick={() => {
                setCurrentPage(1);
                setFilters({
                  documentType: "",
                  status: "",
                  jurisdiction: "",
                  createdFrom: "",
                  createdTo: "",
                });
                setOpenFilterId(null);
              }}
            >
              <TextActionContent icon="x" label="Clear" />
            </button>
          </div>
        </div>
        <div className="overflow-x-auto bg-Color-Neutral-Lightest/80">
          <table className="min-w-full bg-Color-Neutral-Lightest/60 text-left text-sm">
            <thead className="bg-Color-Neutral-Lightest text-xs text-Color-Neutral">
              <tr className="border-b border-Color-Scheme-1-Border/40">
                <th className="px-4 py-3">Document</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Jurisdiction</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Pending signers</th>
                <th className="px-4 py-3">Expected next step</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDocuments.map((document) => {
                const signerSummary = document.signerSummary;
                const hasPendingSigners = (signerSummary?.pendingRequiredSignatureCount ?? 0) > 0;
                const isExpanded = reminderDocumentId === document.id;
                const principalName = getDocumentPrincipalDisplayName(document, currentUserName);
                const documentActionLabel = getDocumentActionLabel(document, currentUserName);
                const documentActionIcon = getDocumentActionIconName(document, currentUserName);

                return (
                <Fragment key={document.id}>
                <tr className={`align-top transition-colors ${isExpanded ? "bg-Color-Neutral-Lighter/70" : "hover:bg-Color-Neutral-Lighter/50"}`}>
                  <td className="max-w-[280px] border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                    <div className="font-medium">{formatDocumentTitle(document)}</div>
                    <div className="mt-1 text-xs text-Color-Neutral">
                      {formatReference(document.id, "DOC")} | Principal: {principalName}
                    </div>
                    <div className="mt-0.5 text-xs text-Color-Neutral">{document.idn ?? "No IDN yet"}</div>
                  </td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadgeClass(document.status)}`}>
                      {formatStatusLabel(document.status)}
                    </span>
                  </td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">
                    {document.jurisdiction?.toUpperCase() ?? "-"}
                  </td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">
                    {formatDateTime(document.createdAt)}
                  </td>
                  <td className="max-w-[260px] border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">
                    {hasPendingSigners ? (
                      <>
                        <div>{signerSummary?.pendingRequiredSignatureCount ?? 0} required pending</div>
                        <div className="mt-1 text-xs text-Color-Neutral">
                          {(signerSummary?.pendingSignerRoles ?? []).map(toTitleWords).join(", ")}
                        </div>
                      </>
                    ) : (
                      "None"
                    )}
                  </td>
                  <td className="max-w-[320px] border-t border-Color-Scheme-1-Border/40 px-4 py-5 text-Color-Neutral">{inferDocumentNextStep(document)}</td>
                  <td className="border-t border-Color-Scheme-1-Border/40 px-4 py-5">
                    <div className="flex flex-wrap gap-2.5">
                      <Link
                        className={getDocumentActionClass(document, currentUserName)}
                        href={getDocumentActionHref(document)}
                      >
                        <TextActionContent icon={documentActionIcon} label={documentActionLabel} />
                      </Link>
                      {hasPendingSigners ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={isReminderLoading || isReminderSending}
                          onClick={() => void previewReminders(document)}
                        >
                          <TextActionContent icon="bell" label="Remind signers" />
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
                {isExpanded ? (
                  <tr>
                    <td colSpan={7} className="bg-Color-Neutral-Lighter/70 px-4 pb-6 pt-2">
                      <div className="rounded-lg border border-Color-Scheme-1-Border/50 bg-Color-Neutral-Lightest p-5 shadow-[0_12px_28px_rgba(0,0,0,0.04)]">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-medium">Signature reminder preview</div>
                              {reminderPreviewDocument ? (
                                <span className="rounded-full border border-Color-Scheme-1-Border/50 px-2 py-0.5 text-[11px] uppercase tracking-wide text-Color-Neutral">
                                  {reminderReadyRecipientCount} ready
                                </span>
                              ) : null}
                            </div>
                            <div className="mt-1 text-xs text-Color-Neutral">
                              {isReminderLoading
                                ? "Checking pending signer eligibility."
                                : reminderPreviewDocument
                                  ? `${reminderPreviewDocument.documentTypeLabel} • Principal: ${reminderPreviewPrincipalName ?? principalDisplayName}`
                                  : "No preview loaded."}
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-50"
                              disabled={!canSendReminder || isReminderSending || isReminderLoading}
                              title={!canSendReminder && reminderPreviewDocument ? "All pending reminders are blocked by missing email or invite status." : undefined}
                              onClick={() => void sendReminders()}
                            >
                              <TextActionContent icon="send" label={reminderSendTarget === "all" ? "Sending..." : "Send reminders"} />
                            </button>
                            <button
                              type="button"
                              className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline"
                              aria-label="Close reminder preview"
                              onClick={() => {
                                setReminderDocumentId(null);
                                setReminderPreview(null);
                                setReminderStatus(null);
                              }}
                            >
                              <TextActionContent icon="x" label="Close" />
                            </button>
                          </div>
                        </div>

                        {reminderStatus ? (
                          <div
                            className={`mt-3 rounded border px-3 py-2 text-sm ${
                              reminderStatus.kind === "success"
                                ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                                : "border-red-200 bg-red-50 text-red-700"
                            }`}
                          >
                            {reminderStatus.message}
                          </div>
                        ) : null}

                        {reminderPreviewDocument && groupedReminderRecipients.length > 0 && !canSendReminder ? (
                          <div className="mt-3 rounded border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/55 px-3 py-2 text-xs text-Color-Neutral">
                            All pending reminders are currently blocked. Check Eligibility for missing email or invite status.
                          </div>
                        ) : null}

                        {reminderPreviewDocument ? (
                          <div className="mt-4 overflow-x-auto">
                            <table className="min-w-full text-left text-sm">
                              <thead className="bg-Color-Neutral-Lightest/55 text-xs font-light text-Color-Neutral">
                                <tr>
                                  <th className="px-3 py-2">Signer</th>
                                  <th className="px-3 py-2">Role</th>
                                  <th className="px-3 py-2">Delivery</th>
                                  <th className="px-3 py-2">Eligibility</th>
                                  <th className="px-3 py-2">Actions</th>
                                </tr>
                              </thead>
                              <tbody>
                                {groupedReminderRecipients.map((recipient) => (
                                  <tr key={recipient.signerIds.join("|")} className="border-t border-Color-Scheme-1-Border/40">
                                    <td className="px-3 py-2">{recipient.name ?? "Unnamed signer"}</td>
                                    <td className="px-3 py-2 text-Color-Neutral">{recipient.roleLabel}</td>
                                    <td className="px-3 py-2 text-Color-Neutral">{recipient.deliveryHint ?? "Missing email"}</td>
                                    <td className="px-3 py-2 text-Color-Neutral">
                                      <span className={`rounded-full px-2 py-0.5 text-xs ${recipient.canSend ? "bg-Color-White text-Color-Neutral-Darkest" : "bg-Color-Neutral-Lightest text-Color-Neutral-Darkest"}`}>
                                        {recipient.canSend
                                          ? recipient.readyCount === recipient.totalCount
                                            ? "Ready"
                                            : `${recipient.readyCount} ready, ${recipient.totalCount - recipient.readyCount} blocked`
                                          : formatReminderSkipReason(recipient.skipReason)}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-Color-Neutral">
                                      <button
                                        type="button"
                                        className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                                        disabled={!recipient.canSend || isReminderLoading || isReminderSending}
                                        title={!recipient.canSend ? "This signer is blocked by missing email or invite status." : undefined}
                                        onClick={() => void sendReminders(recipient.sendableSignerIds)}
                                      >
                                        <TextActionContent icon="send" label={reminderSendTarget === recipient.sendTargetKey ? "Sending..." : "Send"} />
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {groupedReminderRecipients.length === 0 ? (
                              <div className="mt-3 rounded border border-Color-Scheme-1-Border/40 px-3 py-2 text-sm text-Color-Neutral">
                                No pending required signers need a reminder.
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ) : null}
                </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>

        {pagination.total > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-Color-Scheme-1-Border/40 px-4 py-3 text-xs text-Color-Neutral">
            <div>
              Showing {pageStart}-{pageEnd} of {pagination.total}
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span>Rows</span>
                <div className="flex items-center gap-1.5">
                  {pageSizeOptions.map((option) => (
                    <button
                      key={option}
                      type="button"
                      className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                        pageSize === option
                          ? "bg-Green text-Color-Neutral-Darkest"
                          : "text-Color-Neutral hover:bg-Color-White hover:text-Color-Neutral-Darkest"
                      }`}
                      onClick={() => {
                        setPageSize(option);
                        setCurrentPage(1);
                      }}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={activePage <= 1}
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                >
                  Previous
                </button>
                <span>
                  Page {activePage} of {pageCount}
                </span>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 border-0 bg-transparent p-0 text-xs font-medium text-Color-Neutral underline-offset-4 transition-colors hover:text-Color-Neutral-Darkest hover:underline disabled:cursor-not-allowed disabled:opacity-40"
                  disabled={activePage >= pageCount}
                  onClick={() => setCurrentPage((page) => Math.min(pageCount, page + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!isLoading && pagination.total === 0 ? (
          <div className="m-4 rounded border border-Color-Scheme-1-Border/40 bg-Color-Neutral-Lightest/45 px-3 py-2 text-sm text-Color-Neutral">
            {hasActiveFilters ? "No documents match these filters." : "No documents found."}
          </div>
        ) : null}
      </div>

      <Link className="text-sm text-Color-Neutral-Darkest underline" href="/app">
        Back to dashboard
      </Link>
    </div>
  );
}
