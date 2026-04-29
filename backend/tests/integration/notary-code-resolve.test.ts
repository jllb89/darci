import request from "supertest";
import jwt from "jsonwebtoken";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getNotarizationCodeByValueMock: vi.fn(),
  getNotarizationRequestByIdMock: vi.fn(),
  getOrCreateUserIdMock: vi.fn(),
  updateNotarizationCodeMock: vi.fn(),
  updateNotarizationRequestMock: vi.fn(),
  recordAuditEventMock: vi.fn(),
  getIlluminotarizationWorkflowByIdMock: vi.fn(),
  getIlluminotarizationWorkflowByLegacyRequestIdMock: vi.fn(),
  getLatestCodeDeliveryForCodeMock: vi.fn(),
  markCodeDeliveriesConsumedMock: vi.fn(),
  recordAccessCodeAttemptMock: vi.fn(),
  transitionIlluminotarizationWorkflowStatusMock: vi.fn(),
  upsertIlluminotarizationWorkflowAssignmentMock: vi.fn(),
  queueNotaryRequestClaimedNotificationMock: vi.fn(),
}));

vi.mock("../../src/services/documentService", () => ({
  getNotarizationCodeByValue: mocks.getNotarizationCodeByValueMock,
  getNotarizationRequestById: mocks.getNotarizationRequestByIdMock,
  getOrCreateUserId: mocks.getOrCreateUserIdMock,
  updateNotarizationCode: mocks.updateNotarizationCodeMock,
  updateNotarizationRequest: mocks.updateNotarizationRequestMock,
}));

vi.mock("../../src/services/auditService", () => ({
  recordAuditEvent: mocks.recordAuditEventMock,
}));

vi.mock("../../src/services/illuminotarizationWorkflowService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/illuminotarizationWorkflowService")>(
    "../../src/services/illuminotarizationWorkflowService",
  );

  return {
    ...actual,
    getIlluminotarizationWorkflowById: mocks.getIlluminotarizationWorkflowByIdMock,
    getIlluminotarizationWorkflowByLegacyRequestId:
      mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock,
    getLatestCodeDeliveryForCode: mocks.getLatestCodeDeliveryForCodeMock,
    markCodeDeliveriesConsumed: mocks.markCodeDeliveriesConsumedMock,
    recordAccessCodeAttempt: mocks.recordAccessCodeAttemptMock,
    transitionIlluminotarizationWorkflowStatus: mocks.transitionIlluminotarizationWorkflowStatusMock,
    upsertIlluminotarizationWorkflowAssignment: mocks.upsertIlluminotarizationWorkflowAssignmentMock,
  };
});

vi.mock("../../src/services/notificationService", async () => {
  const actual = await vi.importActual<typeof import("../../src/services/notificationService")>(
    "../../src/services/notificationService",
  );

  return {
    ...actual,
    queueNotaryRequestClaimedNotification: mocks.queueNotaryRequestClaimedNotificationMock,
  };
});

import { app } from "../../src/index";

type TokenPayload = {
  sub: string;
  email?: string;
  role?: string;
  app_metadata?: { role?: string };
};

const signToken = (payload: TokenPayload) => {
  const secret = process.env.SUPABASE_JWT_SECRET ?? "test-secret";
  return jwt.sign(payload, secret, { expiresIn: "1h" });
};

const logResponse = (label: string, response: request.Response) => {
  console.log(label, {
    status: response.status,
    body: response.body,
  });
};

const postWithLog = async (
  path: string,
  payload: Record<string, unknown>,
  label: string,
  token?: string
) => {
  console.log("request", { method: "POST", path, payload });
  let req = request(app).post(path).send(payload);
  if (token) {
    req = req.set("Authorization", `Bearer ${token}`);
  }
  const response = await req;
  logResponse(label, response);
  return response;
};

describe("POST /notary/code/resolve", () => {
  beforeEach(() => {
    process.env.SUPABASE_JWT_SECRET = "test-secret";
    mocks.getNotarizationCodeByValueMock.mockReset();
    mocks.getNotarizationRequestByIdMock.mockReset();
    mocks.getOrCreateUserIdMock.mockReset();
    mocks.updateNotarizationCodeMock.mockReset();
    mocks.updateNotarizationRequestMock.mockReset();
    mocks.recordAuditEventMock.mockReset();
    mocks.getIlluminotarizationWorkflowByIdMock.mockReset();
    mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock.mockReset();
    mocks.getLatestCodeDeliveryForCodeMock.mockReset();
    mocks.markCodeDeliveriesConsumedMock.mockReset();
    mocks.recordAccessCodeAttemptMock.mockReset();
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockReset();
    mocks.upsertIlluminotarizationWorkflowAssignmentMock.mockReset();
    mocks.queueNotaryRequestClaimedNotificationMock.mockReset();
    mocks.getIlluminotarizationWorkflowByIdMock.mockResolvedValue(null);
    mocks.getIlluminotarizationWorkflowByLegacyRequestIdMock.mockResolvedValue(null);
    mocks.getLatestCodeDeliveryForCodeMock.mockResolvedValue(null);
    mocks.markCodeDeliveriesConsumedMock.mockResolvedValue(null);
    mocks.recordAccessCodeAttemptMock.mockResolvedValue(null);
    mocks.transitionIlluminotarizationWorkflowStatusMock.mockResolvedValue(null);
    mocks.upsertIlluminotarizationWorkflowAssignmentMock.mockResolvedValue(null);
    mocks.queueNotaryRequestClaimedNotificationMock.mockResolvedValue({ jobId: "job-1" });
  });

  it("resolves code and assigns notary", async () => {
    mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
    mocks.getNotarizationCodeByValueMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "active",
      expires_at: "2099-03-05T00:30:00.000Z",
      consumed_at: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: null,
      status: "pending",
      submitted_at: "2026-03-05T00:00:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.updateNotarizationCodeMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "consumed",
      expires_at: "2099-03-05T00:30:00.000Z",
      consumed_at: "2026-03-05T00:01:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.updateNotarizationRequestMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: "notary-1",
      status: "in_review",
      submitted_at: "2026-03-05T00:00:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    const token = signToken({
      sub: "notary-user-1",
      app_metadata: { role: "notary" },
    });

    const response = await postWithLog(
      "/notary/code/resolve",
      { code: "NTR-1234" },
      "resolves code and assigns notary",
      token
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      request: {
        id: "req-1",
        documentId: "doc-1",
        status: "in_review",
      },
      code: {
        id: "code-1",
        code: "NTR-1234",
        status: "consumed",
        expiresAt: "2099-03-05T00:30:00.000Z",
      },
      workflow: null,
    });
    expect(mocks.recordAuditEventMock).toHaveBeenCalledTimes(3);
  });

  it("requires auth", async () => {
    const response = await postWithLog(
      "/notary/code/resolve",
      { code: "NTR-1234" },
      "requires auth"
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 for unknown code", async () => {
    mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
    mocks.getNotarizationCodeByValueMock.mockResolvedValue(null);

    const token = signToken({
      sub: "notary-user-1",
      app_metadata: { role: "notary" },
    });

    const response = await postWithLog(
      "/notary/code/resolve",
      { code: "NTR-0000" },
      "returns 404 for unknown code",
      token
    );

    expect(response.status).toBe(404);
  });

  it("rejects expired code", async () => {
    mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
    mocks.getNotarizationCodeByValueMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "active",
      expires_at: "2020-03-05T00:30:00.000Z",
      consumed_at: null,
      created_at: "2020-03-05T00:00:00.000Z",
    });

    const token = signToken({
      sub: "notary-user-1",
      app_metadata: { role: "notary" },
    });

    const response = await postWithLog(
      "/notary/code/resolve",
      { code: "NTR-1234" },
      "rejects expired code",
      token
    );

    expect(response.status).toBe(400);
  });

  it("rejects consumed code", async () => {
    mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
    mocks.getNotarizationCodeByValueMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "consumed",
      expires_at: "2026-03-05T00:30:00.000Z",
      consumed_at: "2026-03-05T00:00:10.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    const token = signToken({
      sub: "notary-user-1",
      app_metadata: { role: "notary" },
    });

    const response = await postWithLog(
      "/notary/code/resolve",
      { code: "NTR-1234" },
      "rejects consumed code",
      token
    );

    expect(response.status).toBe(409);
  });

  it("rejects assigned request", async () => {
    mocks.getOrCreateUserIdMock.mockResolvedValue("notary-1");
    mocks.getNotarizationCodeByValueMock.mockResolvedValue({
      id: "code-1",
      request_id: "req-1",
      code: "NTR-1234",
      status: "active",
      expires_at: "2099-03-05T00:30:00.000Z",
      consumed_at: null,
      created_at: "2026-03-05T00:00:00.000Z",
    });
    mocks.getNotarizationRequestByIdMock.mockResolvedValue({
      id: "req-1",
      document_id: "doc-1",
      assigned_notary_id: "notary-2",
      status: "pending",
      submitted_at: "2026-03-05T00:00:00.000Z",
      created_at: "2026-03-05T00:00:00.000Z",
    });

    const token = signToken({
      sub: "notary-user-1",
      app_metadata: { role: "notary" },
    });

    const response = await postWithLog(
      "/notary/code/resolve",
      { code: "NTR-1234" },
      "rejects assigned request",
      token
    );

    expect(response.status).toBe(409);
  });

  it("rejects non-notary role", async () => {
    const token = signToken({
      sub: "member-1",
      app_metadata: { role: "member" },
    });

    const response = await postWithLog(
      "/notary/code/resolve",
      { code: "NTR-1234" },
      "rejects non-notary role",
      token
    );

    expect(response.status).toBe(403);
  });
});
