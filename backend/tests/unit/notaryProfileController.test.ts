import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  approveNotaryApplicationMock: vi.fn(),
  rejectNotaryApplicationMock: vi.fn(),
  submitNotaryApplicationMock: vi.fn(),
  upsertMyNotaryProfileMock: vi.fn(),
  queueApprovedNotificationMock: vi.fn(),
  queueRejectedNotificationMock: vi.fn(),
  runDueNotificationJobsMock: vi.fn(),
}));

vi.mock("../../src/services/notaryProfileService", () => ({
  approveNotaryApplication: mocks.approveNotaryApplicationMock,
  getMyNotaryProfile: vi.fn(),
  listMyNotaryApplication: vi.fn(),
  listNotaryApplications: vi.fn(),
  rejectNotaryApplication: mocks.rejectNotaryApplicationMock,
  submitNotaryApplication: mocks.submitNotaryApplicationMock,
  upsertMyNotaryProfile: mocks.upsertMyNotaryProfileMock,
}));

vi.mock("../../src/services/notificationService", () => ({
  queueNotaryApplicationApprovedNotification: mocks.queueApprovedNotificationMock,
  queueNotaryApplicationRejectedNotification: mocks.queueRejectedNotificationMock,
  queueNotaryApplicationSubmittedAdminNotification: vi.fn(),
}));

vi.mock("../../src/services/notificationOutboxService", () => ({
  runDueNotificationJobs: mocks.runDueNotificationJobsMock,
}));

import {
  approveNotaryApplicationAdminHandler,
  rejectNotaryApplicationAdminHandler,
  submitMyNotaryApplication,
  updateMyNotaryProfileHandler,
} from "../../src/controllers/notaryProfileController";

const buildResponse = () => {
  const response = {
    status: vi.fn(),
    json: vi.fn(),
  };
  response.status.mockReturnValue(response);
  response.json.mockReturnValue(response);
  return response as unknown as Response & {
    status: ReturnType<typeof vi.fn>;
    json: ReturnType<typeof vi.fn>;
  };
};

const buildRequest = (body: Record<string, unknown> = {}) => ({
  params: { id: "application-1" },
  body,
  user: { id: "reviewer-supabase-1" },
}) as unknown as Request;

const application = {
  id: "application-1",
  userId: "applicant-1",
  jurisdiction: "US-OH",
  serviceAreaKind: "county" as const,
  serviceAreaName: "Franklin",
  commissionNumber: "OH-12345",
  commissionExpiresAt: "2028-01-01T00:00:00.000Z",
  signatureDataUrl: null,
  sealDataUrl: null,
  status: "approved" as const,
  reviewNotes: "Approved.",
  reviewedByUserId: "reviewer-1",
  reviewedAt: "2026-06-01T20:00:00.000Z",
  createdAt: "2026-06-01T19:00:00.000Z",
  updatedAt: "2026-06-01T20:00:00.000Z",
};

const applicant = {
  id: "applicant-1",
  supabaseUserId: "applicant-supabase-1",
  email: "member@example.test",
  phone: null,
  firstName: "Member",
  lastName: "User",
};

const profile = {
  id: "profile-1",
  userId: "applicant-1",
  jurisdiction: "US-OH",
  serviceAreaKind: "county" as const,
  serviceAreaName: "Franklin",
  commissionNumber: "OH-12345",
  commissionExpiresAt: "2028-01-01T00:00:00.000Z",
  sealStoragePath: null,
  signatureDataUrl: null,
  sealDataUrl: null,
  createdAt: "2026-06-01T19:00:00.000Z",
  updatedAt: "2026-06-01T20:00:00.000Z",
};

const validProfilePayload = {
  jurisdiction: "US-OH",
  serviceAreaKind: "county",
  serviceAreaName: "Franklin",
  commissionNumber: "OH-12345",
  commissionExpiresAt: "2028-01-01T00:00:00.000Z",
  signatureDataUrl: "data:image/png;base64,AAAA",
  sealDataUrl: "data:image/png;base64,AAAA",
};

describe("notaryProfileController admin application decisions", () => {
  beforeEach(() => {
    mocks.approveNotaryApplicationMock.mockReset();
    mocks.rejectNotaryApplicationMock.mockReset();
    mocks.submitNotaryApplicationMock.mockReset();
    mocks.upsertMyNotaryProfileMock.mockReset();
    mocks.queueApprovedNotificationMock.mockReset();
    mocks.queueRejectedNotificationMock.mockReset();
    mocks.runDueNotificationJobsMock.mockReset();
    mocks.runDueNotificationJobsMock.mockResolvedValue({
      scannedCount: 1,
      claimedCount: 1,
      processedCount: 1,
      jobs: [],
    });
  });

  it("processes the approved notification job immediately", async () => {
    mocks.approveNotaryApplicationMock.mockResolvedValue({ application, applicant, profile });
    mocks.queueApprovedNotificationMock.mockResolvedValue({
      jobId: "approval-job-1",
      deliveryCount: 1,
      existing: false,
    });
    const response = buildResponse();

    await approveNotaryApplicationAdminHandler(
      buildRequest({ reviewNotes: "Approved." }),
      response,
    );

    expect(mocks.queueApprovedNotificationMock).toHaveBeenCalledWith({
      applicationId: "application-1",
      userId: "applicant-1",
      reviewedBySupabaseUserId: "reviewer-supabase-1",
      reviewNotes: "Approved.",
    });
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 1,
      workerId: "notary-application-approved-inline",
      notificationJobIds: ["approval-job-1"],
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });

  it("rejects unsupported notary application image payloads", async () => {
    const response = buildResponse();

    await submitMyNotaryApplication(
      buildRequest({
        ...validProfilePayload,
        signatureDataUrl: "data:image/webp;base64,AAAA",
      }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.submitNotaryApplicationMock).not.toHaveBeenCalled();
  });

  it("rejects unsupported notary profile image payloads", async () => {
    const response = buildResponse();

    await updateMyNotaryProfileHandler(
      buildRequest({
        ...validProfilePayload,
        sealDataUrl: "data:image/webp;base64,AAAA",
      }),
      response,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(mocks.upsertMyNotaryProfileMock).not.toHaveBeenCalled();
  });

  it("processes the rejected notification job immediately", async () => {
    mocks.rejectNotaryApplicationMock.mockResolvedValue({
      ...application,
      status: "rejected",
    });
    mocks.queueRejectedNotificationMock.mockResolvedValue({
      jobId: "rejection-job-1",
      deliveryCount: 1,
      existing: false,
    });
    const response = buildResponse();

    await rejectNotaryApplicationAdminHandler(
      buildRequest({ reviewNotes: "Not enough coverage." }),
      response,
    );

    expect(mocks.queueRejectedNotificationMock).toHaveBeenCalledWith({
      applicationId: "application-1",
      userId: "applicant-1",
      reviewedBySupabaseUserId: "reviewer-supabase-1",
      reviewNotes: "Not enough coverage.",
    });
    expect(mocks.runDueNotificationJobsMock).toHaveBeenCalledWith({
      limit: 1,
      workerId: "notary-application-rejected-inline",
      notificationJobIds: ["rejection-job-1"],
    });
    expect(response.status).toHaveBeenCalledWith(200);
  });
});