import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getLatestNotarizationRequestForDocumentMock: vi.fn(),
  getLatestNotarizationCodeForRequestMock: vi.fn(),
  listFinalizationStatusHistoryMock: vi.fn(),
  listWorkflowStatusHistoryMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentService")>(
    "../../src/services/documentService",
  );

  return {
    ...actual,
    getLatestNotarizationRequestForDocument:
      mocks.getLatestNotarizationRequestForDocumentMock,
    getLatestNotarizationCodeForRequest:
      mocks.getLatestNotarizationCodeForRequestMock,
  };
});

vi.mock("../../src/services/documentFinalizationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/documentFinalizationService")>(
    "../../src/services/documentFinalizationService",
  );

  return {
    ...actual,
    listFinalizationStatusHistory: mocks.listFinalizationStatusHistoryMock,
  };
});

vi.mock("../../src/services/illuminotarizationWorkflowService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/illuminotarizationWorkflowService")>(
    "../../src/services/illuminotarizationWorkflowService",
  );

  return {
    ...actual,
    listWorkflowStatusHistory: mocks.listWorkflowStatusHistoryMock,
  };
});

import {
  buildDocumentWorkspaceSummary,
  buildDocumentWorkspaceSummaries,
} from "../../src/services/documentWorkspaceReadModelService";

describe("documentWorkspaceReadModelService", () => {
  beforeEach(() => {
    mocks.getLatestNotarizationRequestForDocumentMock.mockReset();
    mocks.getLatestNotarizationCodeForRequestMock.mockReset();
    mocks.listFinalizationStatusHistoryMock.mockReset();
    mocks.listWorkflowStatusHistoryMock.mockReset();
    mocks.getLatestNotarizationRequestForDocumentMock.mockResolvedValue(null);
    mocks.getLatestNotarizationCodeForRequestMock.mockResolvedValue(null);
    mocks.listFinalizationStatusHistoryMock.mockResolvedValue([]);
    mocks.listWorkflowStatusHistoryMock.mockResolvedValue([]);
  });

  it("builds a verification-ready summary for an anchored document", async () => {
    mocks.getLatestNotarizationRequestForDocumentMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      workflow_id: "wf-1",
      assigned_notary_id: "notary-1",
      status: "completed",
      submitted_at: "2026-04-20T10:00:00.000Z",
      created_at: "2026-04-20T10:00:00.000Z",
    });
    mocks.getLatestNotarizationCodeForRequestMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      workflow_id: "wf-1",
      code: "ABCD1234",
      status: "consumed",
      expires_at: "2026-04-21T10:00:00.000Z",
      consumed_at: "2026-04-20T12:00:00.000Z",
      created_at: "2026-04-20T10:05:00.000Z",
    });
    mocks.listWorkflowStatusHistoryMock.mockResolvedValue([
      {
        id: "hist-1",
        workflow_id: "wf-1",
        legacy_request_id: "req-1",
        previous_status: "in_review",
        next_status: "approved",
        changed_by_user_id: "notary-1",
        change_source: "review_decision",
        change_reason: null,
        metadata: {},
        created_at: "2026-04-20T11:00:00.000Z",
      },
    ]);
    mocks.listFinalizationStatusHistoryMock.mockResolvedValue([
      {
        id: "fin-1",
        document_id: "doc-1",
        execution_run_id: null,
        document_hash_record_id: null,
        ledger_anchor_attempt_id: null,
        changed_by_user_id: "notary-1",
        status: "ledger_anchored",
        change_source: "system",
        change_reason: null,
        metadata: {},
        created_at: "2026-04-20T12:30:00.000Z",
      },
    ]);

    const summary = await buildDocumentWorkspaceSummary({
      document: {
        id: "doc-1",
        idn: "IDN-1234",
        status: "completed",
      },
      viewerRole: "admin",
    });

    expect(summary).toEqual({
      workflow: {
        requestId: "req-1",
        workflowId: "wf-1",
        requestStatus: "completed",
        latestWorkflowStatus: "approved",
        latestWorkflowStatusAt: "2026-04-20T11:00:00.000Z",
        submittedAt: "2026-04-20T10:00:00.000Z",
        assignedNotaryId: "notary-1",
        latestCodeStatus: "consumed",
        latestCodeExpiresAt: "2026-04-21T10:00:00.000Z",
      },
      finalization: {
        latestStatus: "ledger_anchored",
        latestStatusAt: "2026-04-20T12:30:00.000Z",
        isAnchored: true,
        isVerificationChecked: false,
      },
      verification: {
        status: "ready",
        idn: "IDN-1234",
        verifyPath: "/verify/IDN-1234",
      },
    });
  });

  it("builds map summaries for document lists", async () => {
    const summaries = await buildDocumentWorkspaceSummaries({
      documents: [
        { id: "doc-1", idn: null, status: "draft" },
        { id: "doc-2", idn: "IDN-9999", status: "pending_signature" },
      ],
      viewerRole: "admin",
    });

    expect(Array.from(summaries.keys())).toEqual(["doc-1", "doc-2"]);
    expect(summaries.get("doc-1")?.verification.status).toBe("unavailable");
    expect(summaries.get("doc-2")?.verification.verifyPath).toBe("/verify/IDN-9999");
  });

  it("uses a default summary when a list item summary lookup fails", async () => {
    mocks.getLatestNotarizationRequestForDocumentMock.mockRejectedValueOnce(
      new Error("TypeError: fetch failed"),
    );

    const summaries = await buildDocumentWorkspaceSummaries({
      documents: [{ id: "doc-1", idn: "IDN-1234", status: "pending_signature" }],
      viewerRole: "admin",
    });

    expect(summaries.get("doc-1")).toEqual({
      workflow: {
        requestId: null,
        workflowId: null,
        requestStatus: null,
        latestWorkflowStatus: null,
        latestWorkflowStatusAt: null,
        submittedAt: null,
        assignedNotaryId: null,
        latestCodeStatus: null,
        latestCodeExpiresAt: null,
      },
      finalization: {
        latestStatus: null,
        latestStatusAt: null,
        isAnchored: false,
        isVerificationChecked: false,
      },
      verification: {
        status: "pending_finalization",
        idn: "IDN-1234",
        verifyPath: "/verify/IDN-1234",
      },
    });
  });
});