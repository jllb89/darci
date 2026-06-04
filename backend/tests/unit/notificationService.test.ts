import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fromMock: vi.fn(),
  maybeSingleMock: vi.fn(),
  singleMock: vi.fn(),
  upsertMock: vi.fn(),
  insertMock: vi.fn(),
  awaitQueryMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({
    from: mocks.fromMock,
  })),
}));

import {
  queueNotaryApplicationApprovedNotification,
  queueNotaryApplicationRejectedNotification,
  queueSelectedNotaryRequestNotification,
} from "../../src/services/notificationService";

const buildQuery = (table: string) => {
  const query = {
    select: vi.fn(() => query),
    eq: vi.fn(() => query),
    limit: vi.fn(() => query),
    maybeSingle: vi.fn(() => mocks.maybeSingleMock(table)),
    single: vi.fn(() => mocks.singleMock(table)),
    upsert: vi.fn((payload: unknown, options: unknown) => mocks.upsertMock(table, payload, options)),
    insert: vi.fn((payload: unknown) => {
      mocks.insertMock(table, payload);
      return query;
    }),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve(mocks.awaitQueryMock(table)).then(resolve, reject),
  };

  return query;
};

describe("notificationService notary application decision notifications", () => {
  beforeEach(() => {
    process.env.APP_BASE_URL = "https://app.example.test";
    process.env.SUPABASE_URL = "http://localhost";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.NOTIFICATION_PROVIDER = "internal";
    mocks.fromMock.mockReset();
    mocks.maybeSingleMock.mockReset();
    mocks.singleMock.mockReset();
    mocks.upsertMock.mockReset();
    mocks.insertMock.mockReset();
    mocks.awaitQueryMock.mockReset();
    mocks.fromMock.mockImplementation((table: string) => buildQuery(table));
    mocks.upsertMock.mockResolvedValue({ data: null, error: null });
    mocks.singleMock.mockResolvedValue({ data: { id: "job-1" }, error: null });
    mocks.awaitQueryMock.mockImplementation((table: string) => {
      if (table === "notification_deliveries") {
        return { data: [{ id: "delivery-1", provider: "internal" }], error: null };
      }

      return { data: null, error: null };
    });
  });

  it.each([
    {
      name: "approval",
      queueNotification: queueNotaryApplicationApprovedNotification,
      templateKey: "notary_application_approved_email",
      dedupeKey: "notary_application_approved:application-1",
      triggerEvent: "notary.application_approved",
    },
    {
      name: "rejection",
      queueNotification: queueNotaryApplicationRejectedNotification,
      templateKey: "notary_application_rejected_email",
      dedupeKey: "notary_application_rejected:application-1",
      triggerEvent: "notary.application_rejected",
    },
  ])(
    "seeds the missing $name template and queues an applicant email delivery",
    async ({ queueNotification, templateKey, dedupeKey, triggerEvent }) => {
      mocks.maybeSingleMock
        .mockResolvedValueOnce({
          data: {
            id: "applicant-1",
            email: "member@example.test",
            phone: null,
            first_name: "Member",
            last_name: "User",
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: null, error: null })
        .mockResolvedValueOnce({
          data: {
            id: "template-1",
            template_key: templateKey,
            channel: "email",
            trigger_event: triggerEvent,
          },
          error: null,
        })
        .mockResolvedValueOnce({ data: { id: "reviewer-1" }, error: null });

      const result = await queueNotification({
        applicationId: "application-1",
        userId: "applicant-1",
        reviewedBySupabaseUserId: "reviewer-supabase-1",
        reviewNotes: "Looks good.",
      });

      expect(result).toEqual({ jobId: "job-1", deliveryCount: 1, existing: false });
      expect(mocks.upsertMock).toHaveBeenCalledWith(
        "notification_templates",
        expect.objectContaining({
          template_key: templateKey,
          audience_scope: "client",
          channel: "email",
          is_active: true,
        }),
        { onConflict: "template_key,template_version,locale,channel" },
      );
      expect(mocks.insertMock).toHaveBeenCalledWith(
        "notification_jobs",
        expect.objectContaining({
          template_id: "template-1",
          requested_by_user_id: "reviewer-1",
          job_kind: "status_update",
          channel: "email",
          status: "queued",
          dedupe_key: dedupeKey,
          metadata: expect.objectContaining({ templateKey, triggerEvent }),
        }),
      );
      expect(mocks.insertMock).toHaveBeenCalledWith(
        "notification_deliveries",
        [
          expect.objectContaining({
            notification_job_id: "job-1",
            target_user_id: "applicant-1",
            channel: "email",
            recipient_address: "member@example.test",
            provider: "internal",
            status: "queued",
          }),
        ],
      );
    },
  );

  it("queues the selected notary request email to the notary with the review CTA", async () => {
    mocks.maybeSingleMock
      .mockResolvedValueOnce({
        data: {
          id: "doc-1",
          owner_id: "owner-1",
          document_type: "generic",
          product_flow_mode: "notarize_document",
          jurisdiction: "US-OH",
          idn: "IDN-123",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "owner-1",
          email: "owner@example.test",
          phone: null,
          first_name: "Olivia",
          last_name: "Owner",
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          id: "notary-1",
          email: "notary@example.test",
          phone: null,
          first_name: "Nora",
          last_name: "Tary",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({
        data: {
          id: "template-1",
          template_key: "notary_request_received_email",
          channel: "email",
          trigger_event: "member.notary_selected",
        },
        error: null,
      })
      .mockResolvedValueOnce({ data: { id: "requester-1" }, error: null });

    const result = await queueSelectedNotaryRequestNotification({
      documentId: "doc-1",
      requestId: "req-1",
      selectedNotaryUserId: "notary-1",
      requestedBySupabaseUserId: "requester-supabase-1",
    });

    expect(result).toEqual({ jobId: "job-1", deliveryCount: 1, existing: false });
    expect(mocks.upsertMock).toHaveBeenCalledWith(
      "notification_templates",
      expect.objectContaining({
        template_key: "notary_request_received_email",
        audience_scope: "notary",
        channel: "email",
        trigger_event: "member.notary_selected",
        is_active: true,
      }),
      { onConflict: "template_key,template_version,locale,channel" },
    );
    expect(mocks.insertMock).toHaveBeenCalledWith(
      "notification_jobs",
      expect.objectContaining({
        template_id: "template-1",
        document_id: "doc-1",
        notarization_request_id: "req-1",
        requested_by_user_id: "requester-1",
        job_kind: "status_update",
        channel: "email",
        status: "queued",
        dedupe_key: "selected_notary_request:req-1:notary-1",
        payload_json: expect.objectContaining({
          firstName: "Nora",
          memberName: "Olivia Owner",
          documentName: "document notarization",
          jurisdiction: "US-OH",
          reviewRequestUrl: "https://app.example.test/app/notary",
          dashboardUrl: "https://app.example.test/app/notary",
          requestId: "req-1",
          documentId: "doc-1",
        }),
        metadata: expect.objectContaining({
          templateKey: "notary_request_received_email",
          triggerEvent: "member.notary_selected",
          requestId: "req-1",
          selectedNotaryUserId: "notary-1",
        }),
      }),
    );
    expect(mocks.insertMock).toHaveBeenCalledWith(
      "notification_deliveries",
      [
        expect.objectContaining({
          notification_job_id: "job-1",
          target_user_id: "notary-1",
          channel: "email",
          recipient_address: "notary@example.test",
          provider: "internal",
          status: "queued",
        }),
      ],
    );
  });
});