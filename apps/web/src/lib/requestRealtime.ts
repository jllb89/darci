"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabaseClient";

export type RequestRealtimeTarget = {
  table: string;
  filter?: string | null;
};

export type RequestRealtimeBroadcastTarget = {
  event: string;
  private?: boolean | null;
};

type UseRequestRealtimeInvalidationInput = {
  enabled: boolean;
  accessToken: string | null | undefined;
  refreshToken?: string | null | undefined;
  channelName: string;
  targets: RequestRealtimeTarget[];
  broadcastTargets?: RequestRealtimeBroadcastTarget[];
  tableChangeTargetsEnabled?: boolean;
  onInvalidate: () => void | Promise<void>;
  debounceMs?: number;
  minimumInvalidateIntervalMs?: number;
  pollIntervalMs?: number | null;
};

export type RequestRealtimeConnectionStatus = "idle" | "connecting" | "live" | "degraded";

export type RequestRealtimeConnectionState = {
  status: RequestRealtimeConnectionStatus;
  isPollingFallbackActive: boolean;
  lastInvalidatedAt: string | null;
};

export const requestRealtimeBroadcastEvent = "request_changed";

const defaultDebounceMs = 400;
const defaultMinimumInvalidateIntervalMs = 5_000;

export const buildRealtimeEqualsFilter = (column: string, value: string | null | undefined) => {
  const normalizedColumn = column.trim();
  const normalizedValue = value?.trim();
  return normalizedColumn && normalizedValue ? `${normalizedColumn}=eq.${normalizedValue}` : null;
};

export const normalizeRealtimeTargets = (targets: RequestRealtimeTarget[]) => {
  const seen = new Set<string>();
  const normalizedTargets: RequestRealtimeTarget[] = [];

  for (const target of targets) {
    const table = target.table.trim();
    if (!table) {
      continue;
    }

    const filter = target.filter?.trim() || null;
    const key = `${table}:${filter ?? ""}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedTargets.push({ table, filter });
  }

  return normalizedTargets;
};

export const buildRealtimeTargetSignature = (targets: RequestRealtimeTarget[]) => {
  return JSON.stringify(normalizeRealtimeTargets(targets));
};

export const normalizeRealtimeBroadcastTargets = (targets: RequestRealtimeBroadcastTarget[] = []) => {
  const seen = new Set<string>();
  const normalizedTargets: RequestRealtimeBroadcastTarget[] = [];

  for (const target of targets) {
    const event = target.event.trim();
    if (!event) {
      continue;
    }

    const nextTarget = { event, private: Boolean(target.private) };
    const key = `${nextTarget.event}:${nextTarget.private ? "private" : "public"}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedTargets.push(nextTarget);
  }

  return normalizedTargets;
};

export const buildRealtimeBroadcastTargetSignature = (targets: RequestRealtimeBroadcastTarget[] = []) => {
  return JSON.stringify(normalizeRealtimeBroadcastTargets(targets));
};

const parseRealtimeTargetSignature = (signature: string) => {
  try {
    const parsed = JSON.parse(signature) as RequestRealtimeTarget[];
    return normalizeRealtimeTargets(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
};

const parseRealtimeBroadcastTargetSignature = (signature: string) => {
  try {
    const parsed = JSON.parse(signature) as RequestRealtimeBroadcastTarget[];
    return normalizeRealtimeBroadcastTargets(Array.isArray(parsed) ? parsed : []);
  } catch {
    return [];
  }
};

export const useRequestRealtimeInvalidation = ({
  enabled,
  accessToken,
  refreshToken,
  channelName,
  targets,
  broadcastTargets = [],
  tableChangeTargetsEnabled = true,
  onInvalidate,
  debounceMs = defaultDebounceMs,
  minimumInvalidateIntervalMs = defaultMinimumInvalidateIntervalMs,
  pollIntervalMs = null,
}: UseRequestRealtimeInvalidationInput) => {
  const invalidateRef = useRef(onInvalidate);
  const [connectionState, setConnectionState] = useState<RequestRealtimeConnectionState>({
    status: "idle",
    isPollingFallbackActive: false,
    lastInvalidatedAt: null,
  });
  const targetSignature = buildRealtimeTargetSignature(targets);
  const effectiveTargetSignature = tableChangeTargetsEnabled ? targetSignature : "[]";
  const broadcastTargetSignature = buildRealtimeBroadcastTargetSignature(broadcastTargets);
  const normalizedTargetsForState = parseRealtimeTargetSignature(effectiveTargetSignature);
  const normalizedBroadcastTargetsForState = parseRealtimeBroadcastTargetSignature(broadcastTargetSignature);
  const hasRealtimeTargets = normalizedTargetsForState.length > 0;
  const hasBroadcastTargets = normalizedBroadcastTargetsForState.length > 0;
  const hasChannelTargets = hasRealtimeTargets || hasBroadcastTargets;
  const isPollingFallbackConfigured = Boolean(pollIntervalMs && pollIntervalMs > 0);
  const shouldUseRealtime = Boolean(enabled && accessToken);

  useEffect(() => {
    invalidateRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    if (!shouldUseRealtime) {
      return;
    }
    const realtimeAccessToken = accessToken;
    if (!realtimeAccessToken) {
      return;
    }

    const normalizedTargets = parseRealtimeTargetSignature(effectiveTargetSignature);
    const normalizedBroadcastTargets = parseRealtimeBroadcastTargetSignature(broadcastTargetSignature);
    if (normalizedTargets.length === 0 && normalizedBroadcastTargets.length === 0 && !pollIntervalMs) {
      return;
    }

    let isDisposed = false;
    let isInvalidating = false;
    let rerunAfterCurrent = false;
    let debounceTimer: number | null = null;
    let throttleTimer: number | null = null;
    let pollTimer: number | null = null;
    let lastInvalidationStartedAt = 0;
    const supabase = getSupabaseBrowserClient();
    const channel = normalizedTargets.length > 0 || normalizedBroadcastTargets.length > 0
      ? supabase.channel(channelName, {
          config: {
            private: normalizedBroadcastTargets.some((target) => target.private),
            broadcast: {
              ack: false,
              self: false,
            },
          },
        })
      : null;

    const isPollingFallbackCurrentlyActive = () => pollTimer !== null;

    const ensurePollingFallback = () => {
      if (!pollIntervalMs || pollIntervalMs <= 0 || pollTimer !== null) {
        return isPollingFallbackCurrentlyActive();
      }

      pollTimer = window.setInterval(scheduleInvalidation, pollIntervalMs);
      return true;
    };

    const stopPollingFallback = () => {
      if (pollTimer === null) {
        return;
      }

      window.clearInterval(pollTimer);
      pollTimer = null;
    };

    const runInvalidation = () => {
      if (isDisposed) {
        return;
      }

      if (isInvalidating) {
        rerunAfterCurrent = true;
        return;
      }

      isInvalidating = true;
      lastInvalidationStartedAt = Date.now();
      Promise.resolve(invalidateRef.current())
        .catch((error) => {
          const isFallbackActive = ensurePollingFallback();
          setConnectionState((current) => ({
            ...current,
            status: "degraded",
            isPollingFallbackActive: isFallbackActive,
          }));
          console.warn("Realtime invalidation refetch failed", {
            channelName,
            error: error instanceof Error ? error.message : String(error),
          });
        })
        .finally(() => {
          if (!isDisposed) {
            setConnectionState((current) => ({
              ...current,
              isPollingFallbackActive: isPollingFallbackCurrentlyActive(),
              lastInvalidatedAt: new Date().toISOString(),
            }));
          }
          isInvalidating = false;
          if (rerunAfterCurrent && !isDisposed) {
            rerunAfterCurrent = false;
            scheduleInvalidation();
          }
        });
    };

    const scheduleInvalidation = () => {
      if (isDisposed) {
        return;
      }

      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      if (throttleTimer !== null) {
        window.clearTimeout(throttleTimer);
      }

      const elapsedMs = lastInvalidationStartedAt > 0 ? Date.now() - lastInvalidationStartedAt : minimumInvalidateIntervalMs;
      const throttleDelayMs = Math.max(0, minimumInvalidateIntervalMs - elapsedMs);
      const delayMs = Math.max(debounceMs, throttleDelayMs);
      throttleTimer = window.setTimeout(() => {
        debounceTimer = window.setTimeout(runInvalidation, debounceMs);
      }, delayMs);
    };

    const subscribe = async () => {
      if (!channel) {
        return;
      }

      if (refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: realtimeAccessToken,
          refresh_token: refreshToken,
        });

        if (error) {
          throw error;
        }
      } else {
        supabase.realtime.setAuth(realtimeAccessToken);
      }

      if (isDisposed) {
        return;
      }

      for (const target of normalizedTargets) {
        channel.on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: target.table,
            ...(target.filter ? { filter: target.filter } : {}),
          },
          scheduleInvalidation,
        );
      }

      for (const target of normalizedBroadcastTargets) {
        channel.on(
          "broadcast",
          {
            event: target.event,
          },
          scheduleInvalidation,
        );
      }

      channel.subscribe((status) => {
        if (isDisposed) {
          return;
        }

        if (status === "SUBSCRIBED") {
          stopPollingFallback();
          setConnectionState((current) => ({
            ...current,
            status: "live",
            isPollingFallbackActive: false,
          }));
          return;
        }

        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          const isFallbackActive = ensurePollingFallback();
          setConnectionState((current) => ({
            ...current,
            status: "degraded",
            isPollingFallbackActive: isFallbackActive,
          }));
          console.warn("Realtime invalidation subscription degraded", {
            channelName,
            status,
          });
        }
      });
    };

    void subscribe().catch((error) => {
      if (!isDisposed) {
        const isFallbackActive = ensurePollingFallback();
        setConnectionState((current) => ({
          ...current,
          status: "degraded",
          isPollingFallbackActive: isFallbackActive,
        }));
      }
      console.warn("Realtime invalidation subscription unavailable", {
        channelName,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    if (!channel && pollIntervalMs && pollIntervalMs > 0) {
      pollTimer = window.setInterval(scheduleInvalidation, pollIntervalMs);
    }

    return () => {
      isDisposed = true;
      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }
      if (throttleTimer !== null) {
        window.clearTimeout(throttleTimer);
      }
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
      }
      if (channel) {
        void supabase.removeChannel(channel);
      }
    };
  }, [accessToken, broadcastTargetSignature, channelName, debounceMs, effectiveTargetSignature, minimumInvalidateIntervalMs, pollIntervalMs, refreshToken, shouldUseRealtime]);

  if (!shouldUseRealtime || (!hasChannelTargets && !isPollingFallbackConfigured)) {
    return {
      ...connectionState,
      status: "idle",
      isPollingFallbackActive: false,
    };
  }

  if (!hasChannelTargets) {
    return {
      ...connectionState,
      status: "degraded",
      isPollingFallbackActive: isPollingFallbackConfigured,
    };
  }

  return {
    ...connectionState,
    status: connectionState.status === "idle" ? "connecting" : connectionState.status,
  };
};