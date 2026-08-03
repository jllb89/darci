import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  channelMock: vi.fn(),
  createClientMock: vi.fn(),
  httpSendMock: vi.fn(),
  removeChannelMock: vi.fn(),
  setAuthMock: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({
  createClient: mocks.createClientMock,
}));

import {
  broadcastRequestRealtimeInvalidation,
  buildRequestRealtimeBroadcastChannels,
  buildRequestRealtimeBroadcastPayload,
  getNotaryQueueRealtimeChannel,
  requestRealtimeBroadcastEvent,
} from "../../src/services/realtimeBroadcastService";

describe("realtime broadcast service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";
    process.env.REALTIME_BROADCASTS_IN_TESTS = "true";
    process.env.REALTIME_BROADCASTS_DISABLED = "false";

    mocks.httpSendMock.mockResolvedValue({ success: true });
    mocks.removeChannelMock.mockResolvedValue("ok");
    mocks.channelMock.mockImplementation((channelName: string) => ({
      channelName,
      httpSend: mocks.httpSendMock,
    }));
    mocks.createClientMock.mockReturnValue({
      channel: mocks.channelMock,
      removeChannel: mocks.removeChannelMock,
      realtime: {
        setAuth: mocks.setAuthMock,
      },
    });
  });

  it("builds request and queue broadcast channels", () => {
    expect(buildRequestRealtimeBroadcastChannels(" req-1 ", " notary-1 ")).toEqual([
      "request:req-1",
      "notary-queue:notary-1",
    ]);
    expect(buildRequestRealtimeBroadcastChannels("req-1")).toEqual(["request:req-1"]);
    expect(getNotaryQueueRealtimeChannel(" notary-1 ")).toBe("notary-queue:notary-1");
  });

  it("builds a compact invalidation payload", () => {
    expect(
      buildRequestRealtimeBroadcastPayload({
        requestId: "req-1",
        documentId: "doc-1",
        workflowId: "workflow-1",
        reason: "session_started",
        changedAt: "2026-06-15T12:00:00.000Z",
      }),
    ).toEqual({
      type: requestRealtimeBroadcastEvent,
      requestId: "req-1",
      documentId: "doc-1",
      workflowId: "workflow-1",
      reason: "session_started",
      changedAt: "2026-06-15T12:00:00.000Z",
    });
  });

  it("sends private request invalidations over REST broadcast", async () => {
    const result = await broadcastRequestRealtimeInvalidation({
      requestId: "req-1",
      queueUserId: "notary-1",
      documentId: "doc-1",
      workflowId: "workflow-1",
      reason: "identity_verified",
      changedAt: "2026-06-15T12:00:00.000Z",
    });

    expect(result).toEqual({
      status: "sent",
      channels: ["request:req-1", "notary-queue:notary-1"],
    });
    expect(mocks.createClientMock).toHaveBeenCalledWith(
      "https://example.supabase.co",
      "service-role-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    );
    expect(mocks.setAuthMock).toHaveBeenCalledWith("service-role-key");
    expect(mocks.channelMock).toHaveBeenCalledWith(
      "request:req-1",
      expect.objectContaining({
        config: expect.objectContaining({
          private: true,
          broadcast: { ack: true, self: false },
        }),
      }),
    );
    expect(mocks.channelMock).toHaveBeenCalledWith(
      "notary-queue:notary-1",
      expect.objectContaining({
        config: expect.objectContaining({
          private: true,
          broadcast: { ack: true, self: false },
        }),
      }),
    );
    expect(mocks.httpSendMock).toHaveBeenCalledTimes(2);
    expect(mocks.httpSendMock).toHaveBeenCalledWith(
      requestRealtimeBroadcastEvent,
      expect.objectContaining({
        requestId: "req-1",
        reason: "identity_verified",
      }),
      { timeout: 2_000 },
    );
    expect(mocks.removeChannelMock).toHaveBeenCalledTimes(2);
  });
});