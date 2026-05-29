import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";

  return {
    getOrCreateUserIdMock: vi.fn(),
    listDocumentsMock: vi.fn(),
    listRecentAuditEventsForDocumentIdsMock: vi.fn(),
    listSigningRequestCardsMock: vi.fn(),
  };
});

vi.mock("../../src/services/documentService", () => ({
  getOrCreateUserId: mocks.getOrCreateUserIdMock,
  listDocuments: mocks.listDocumentsMock,
}));

vi.mock("../../src/services/auditService", () => ({
  listRecentAuditEventsForDocumentIds: mocks.listRecentAuditEventsForDocumentIdsMock,
}));

vi.mock("../../src/services/documentInviteService", () => ({
  listSigningRequestCards: mocks.listSigningRequestCardsMock,
}));

import { buildRoleAwareDashboard } from "../../src/services/dashboardAggregationService";

describe("buildRoleAwareDashboard", () => {
  beforeEach(() => {
    mocks.getOrCreateUserIdMock.mockReset();
    mocks.listDocumentsMock.mockReset();
    mocks.listRecentAuditEventsForDocumentIdsMock.mockReset();
    mocks.listSigningRequestCardsMock.mockReset();
  });

  it("includes signing invite cards on member dashboards", async () => {
    mocks.getOrCreateUserIdMock.mockResolvedValue("member-db-1");
    mocks.listDocumentsMock.mockResolvedValue([]);
    mocks.listSigningRequestCardsMock.mockResolvedValue({
      incoming: [
        {
          id: "incoming-invite-1",
          inviteId: "invite-1",
          direction: "incoming",
          documentId: "document-1",
          documentLabel: "Kevin Eberts Trust",
          documentTypeLabel: "Trust Registration Amendment",
          signerName: "Kevin Eberts",
          signerEmail: "kevin@example.com",
          signerPhone: null,
          senderName: "Member User",
          senderEmail: "member@example.com",
          roleLabel: "Trustmaker",
          status: "sent",
          sentAt: "2026-05-28T12:00:00.000Z",
          updatedAt: "2026-05-28T12:01:00.000Z",
          expiresAt: null,
          completedAt: null,
          firstOpenedAt: null,
          firstClickedAt: null,
          resendCount: 0,
          actionHref: "/app/sign?documentId=document-1",
          actionLabel: "Sign document",
          detail: "Member User requested your trustmaker signature.",
        },
      ],
      outgoing: [],
    });

    const dashboard = await buildRoleAwareDashboard({
      supabaseUserId: "member-auth-1",
      email: "member@example.com",
      role: "member",
    });

    expect(mocks.listSigningRequestCardsMock).toHaveBeenCalledWith({
      role: "member",
      viewerUserId: "member-db-1",
      viewerEmail: "member@example.com",
      limit: 10,
    });
    expect(dashboard.signatureRequests).toEqual([
      expect.objectContaining({
        id: "incoming-invite-1",
        documentId: "document-1",
        actionHref: "/app/sign?documentId=document-1",
      }),
    ]);
    expect(dashboard.requests).toEqual([]);
  });
});