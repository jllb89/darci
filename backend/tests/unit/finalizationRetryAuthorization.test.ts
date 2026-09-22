import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ document: vi.fn(), active: vi.fn(), latest: vi.fn(), actor: vi.fn() }));
vi.mock("../../src/services/documentService", async importOriginal => ({
  ...await importOriginal<typeof import("../../src/services/documentService")>(),
  getDocumentById: mocks.document, getActiveNotarizationRequest: mocks.active,
  getLatestNotarizationRequestForDocument: mocks.latest, getUserIdBySupabaseId: mocks.actor,
}));
import { resolveAuthorizedFinalizationContext, DocumentFinalizationConflictError, DocumentFinalizationForbiddenError } from "../../src/services/documentFinalizationService";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.document.mockResolvedValue({ id: "doc", status: "completed" });
  mocks.active.mockResolvedValue(null);
  mocks.latest.mockResolvedValue({ id: "request", document_id: "doc", status: "completed", assigned_notary_id: "selected" });
  mocks.actor.mockResolvedValue("selected");
});
describe("completed finalization retry authorization", () => {
  const input = { documentId: "doc", actorSupabaseId: "auth-notary", actorRole: "notary", allowCompletedRetry: true };
  it("resolves the completed request for the same assigned notary", async () => {
    expect((await resolveAuthorizedFinalizationContext(input)).request.id).toBe("request");
  });
  it("does not admit an unrelated notary on a completed request", async () => {
    mocks.actor.mockResolvedValue("stranger");
    await expect(resolveAuthorizedFinalizationContext(input)).rejects.toBeInstanceOf(DocumentFinalizationForbiddenError);
  });
  it("does not admit an unregistered notary", async () => {
    mocks.actor.mockResolvedValue(null);
    await expect(resolveAuthorizedFinalizationContext(input)).rejects.toBeInstanceOf(DocumentFinalizationForbiddenError);
  });
  it("does not reopen rejected requests", async () => {
    mocks.latest.mockResolvedValue({ status: "rejected" });
    await expect(resolveAuthorizedFinalizationContext(input)).rejects.toBeInstanceOf(DocumentFinalizationConflictError);
  });
  it("does not permit acknowledgment append to reuse a completed session", async () => {
    await expect(resolveAuthorizedFinalizationContext({ ...input, allowCompletedRetry: false })).rejects.toBeInstanceOf(DocumentFinalizationConflictError);
    expect(mocks.latest).not.toHaveBeenCalled();
  });
  it("does not treat an unfinished document as a completed retry", async () => {
    mocks.document.mockResolvedValue({ id: "doc", status: "pending_notary" });
    await expect(resolveAuthorizedFinalizationContext(input)).rejects.toBeInstanceOf(DocumentFinalizationConflictError);
    expect(mocks.latest).not.toHaveBeenCalled();
  });
});
