import { createClient } from "@supabase/supabase-js";

export const requestRealtimeBroadcastEvent = "request_changed";
export const notaryQueueRealtimeChannel = "notary-queue";

export type RequestRealtimeBroadcastReason =
  | "review_decision_recorded"
  | "session_started"
  | "meeting_checkin_recorded"
  | "same_place_evaluated"
  | "identity_verified"
  | "venue_captured"
  | "meeting_artifact_recorded"
  | "acknowledgment_sealed"
  | "meeting_completed"
  | "final_package_submitted";

export type RequestRealtimeBroadcastPayload = {
  type: typeof requestRealtimeBroadcastEvent;
  requestId: string;
  documentId: string | null;
  workflowId: string | null;
  reason: RequestRealtimeBroadcastReason;
  changedAt: string;
};

export type RequestRealtimeBroadcastResult = {
  status: "sent" | "partial_failure" | "skipped";
  channels: string[];
};

const broadcastTimeoutMs = 2_000;

let realtimeClient: ReturnType<typeof createClient> | null = null;

export const getRequestRealtimeChannel = (requestId: string) => `request:${requestId.trim()}`;

export const buildRequestRealtimeBroadcastChannels = (requestId: string) => {
  return Array.from(new Set([getRequestRealtimeChannel(requestId), notaryQueueRealtimeChannel]));
};

export const buildRequestRealtimeBroadcastPayload = (input: {
  requestId: string;
  documentId?: string | null;
  workflowId?: string | null;
  reason: RequestRealtimeBroadcastReason;
  changedAt?: string;
}): RequestRealtimeBroadcastPayload => ({
  type: requestRealtimeBroadcastEvent,
  requestId: input.requestId,
  documentId: input.documentId ?? null,
  workflowId: input.workflowId ?? null,
  reason: input.reason,
  changedAt: input.changedAt ?? new Date().toISOString(),
});

const shouldSkipRealtimeBroadcasts = () => {
  if (process.env.REALTIME_BROADCASTS_DISABLED === "true") {
    return true;
  }

  return process.env.VITEST === "true" && process.env.REALTIME_BROADCASTS_IN_TESTS !== "true";
};

const getRealtimeClient = () => {
  if (realtimeClient) {
    return realtimeClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return null;
  }

  realtimeClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        "X-Client-Info": "darci-backend-realtime-broadcast",
      },
    },
  });

  realtimeClient.realtime.setAuth(supabaseServiceRoleKey);

  return realtimeClient;
};

export const broadcastRequestRealtimeInvalidation = async (input: {
  requestId: string;
  documentId?: string | null;
  workflowId?: string | null;
  reason: RequestRealtimeBroadcastReason;
  changedAt?: string;
}): Promise<RequestRealtimeBroadcastResult> => {
  const channels = buildRequestRealtimeBroadcastChannels(input.requestId);
  if (shouldSkipRealtimeBroadcasts()) {
    return { status: "skipped", channels };
  }

  const client = getRealtimeClient();
  if (!client) {
    return { status: "skipped", channels };
  }

  const payload = buildRequestRealtimeBroadcastPayload(input);
  const results = await Promise.allSettled(
    channels.map(async (channelName) => {
      const channel = client.channel(channelName, {
        config: {
          private: true,
          broadcast: {
            ack: true,
            self: false,
          },
        },
      });

      try {
        await channel.httpSend(requestRealtimeBroadcastEvent, payload, {
          timeout: broadcastTimeoutMs,
        });
      } finally {
        await client.removeChannel(channel);
      }
    }),
  );

  const failures = results.filter((result) => result.status === "rejected");
  if (failures.length > 0) {
    console.warn("Realtime broadcast invalidation failed", {
      requestId: input.requestId,
      reason: input.reason,
      failedChannels: failures.length,
    });
  }

  return {
    status: failures.length > 0 ? "partial_failure" : "sent",
    channels,
  };
};