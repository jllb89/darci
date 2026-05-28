import { refreshStoredAuth } from "@/lib/auth";

export const notaryApiBaseUrl =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") || "http://localhost:4000";

export type NotaryIdentitySummary = {
  userId: string;
  supabaseUserId: string;
  displayName: string;
  fullName: string | null;
  email: string | null;
  role: string;
  status: string;
};

export type NotaryQueueRequestSummary = {
  request: {
    id: string;
    documentId: string;
    workflowId: string | null;
    status: string | null;
    queueStatus: string | null;
    submittedAt: string | null;
  };
  document: {
    id: string;
    idn: string | null;
    status: string | null;
    documentType: string | null;
    jurisdiction: string | null;
    createdAt: string;
    summary: {
      finalization: {
        latestStatus: string | null;
        latestStatusAt: string | null;
        isAnchored: boolean;
        isVerificationChecked: boolean;
      };
      verification: {
        status: string;
        idn: string | null;
        verifyPath: string | null;
      };
    };
  };
  owner: NotaryIdentitySummary | null;
  workflow: {
    id: string | null;
    status: string | null;
    latestStatus: string | null;
    latestStatusAt: string | null;
    reviewStartedAt: string | null;
    closedAt: string | null;
    selectedNotaryUserId: string | null;
    assignedNotaryUserId: string | null;
    lastCodeGeneratedAt: string | null;
  } | null;
  latestCodeDelivery: {
    id: string;
    channel: string;
    deliveryMethod: string;
    deliveryReason: string;
    status: string;
    expiresAt: string | null;
    deliveredAt: string | null;
    consumedAt: string | null;
    invalidatedAt: string | null;
    createdAt: string;
  } | null;
  meeting: {
    id: string;
    requestId: string;
    documentId: string;
    documentType: string | null;
    ownerName: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
  } | null;
  finalization: {
    latestStatus: string | null;
    latestStatusAt: string | null;
    isAnchored: boolean;
    isVerificationChecked: boolean;
    verificationStatus: string | null;
    anchoredAt: string | null;
    lastCheckedAt: string | null;
    publicVerifyPath: string | null;
  };
  nextAction: string | null;
};

export type NotaryQueueResponse = {
  requests: NotaryQueueRequestSummary[];
  meetings: Array<NonNullable<NotaryQueueRequestSummary["meeting"]>>;
  counts: {
    pending: number;
    scheduled: number;
    contactHandoff?: number;
    readyForInPerson?: number;
    completed: number;
    total: number;
  };
};

export type NotaryRequestContext = {
  request: NotaryQueueRequestSummary["request"];
  document: NotaryQueueRequestSummary["document"] & {
    versions: Array<{
      id: string;
      version: number;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      isFinal: boolean;
      createdAt: string;
    }>;
    reviewDocuments: Array<{
      id: string;
      versionId: string;
      label: string;
      fileName: string | null;
      mimeType: string | null;
      sizeBytes: number | null;
      isFinal: boolean;
      downloadUrl: string | null;
      createdAt: string;
    }>;
  };
  owner: NotaryIdentitySummary | null;
  notary: NotaryIdentitySummary | null;
  workflow: NotaryQueueRequestSummary["workflow"];
  latestCodeDelivery: NotaryQueueRequestSummary["latestCodeDelivery"];
  meeting: {
    meetingId: string;
    requestId: string;
    workflowId: string | null;
    scheduledAt: string | null;
    timezone: string | null;
    location: string | null;
    status: string | null;
    samePlaceRequired: boolean;
    samePlaceStatus: string | null;
    proposedSlots: string[];
    participants: Array<{
      id: string;
      userId: string | null;
      participantRole: string;
      status: string;
      presenceRequired: boolean;
      participantLabel: string | null;
      arrivedAt: string | null;
      departedAt: string | null;
    }>;
  } | null;
  evidence: {
    checkins: Array<{ id: string; status: string; participantRole: string; recordedAt: string }>;
    geolocationSamples: Array<{ id: string; capturedAt: string }>;
    identityVerifications: Array<{ id: string; status: string; subjectName: string | null }>;
    proximityEvaluations: Array<{ id: string; status: string; observedDistanceMeters: number | null }>;
    artifacts: Array<{ id: string; artifactKind: string; status: string; capturedAt: string | null }>;
  };
  finalization: NotaryQueueRequestSummary["finalization"] & {
    hash: string | null;
    ledgerTxId: string | null;
    anchorAttempt: {
      id: string;
      status: string;
      attemptNumber: number;
      requestedAt: string;
      completedAt: string | null;
      failedAt: string | null;
      errorMessage: string | null;
    } | null;
    history: Array<{
      id: string;
      status: string;
      changeSource: string;
      changeReason: string | null;
      createdAt: string;
    }>;
  };
  capabilities: {
    canReviewRequest: boolean;
    canManageMeeting: boolean;
    canRecordEvidence: boolean;
    canFinalizeDocument: boolean;
    canOpenVerification: boolean;
  };
  warnings: Array<{
    code: string;
    severity: "info" | "warning";
    message: string;
  }>;
  nextAction: string | null;
};

export const fetchWithTokenRefresh = async (
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

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
};

export const readApiErrorMessage = async (response: Response, fallback: string) => {
  try {
    const payload: unknown = await response.json();
    if (isRecord(payload) && typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    return fallback;
  }

  return fallback;
};

export const formatStatusLabel = (value: string | null | undefined) => {
  const normalized = value?.trim();
  if (!normalized) {
    return "Not set";
  }

  return normalized
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
};

export const formatDateTime = (value: string | null | undefined) => {
  if (!value) {
    return "-";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
};

export const formatFileSize = (value: number | null | undefined) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return "-";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};