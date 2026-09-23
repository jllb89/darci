import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Queue } from "bullmq";
import { generationQueue } from "../worker/queues";

// PostgreSQL owns run state; Redis is only a delivery mechanism. Never infer
// that a rendering run is safe to retry: it may already have written evidence.
export async function reconcileQueuedGenerationRuns(limit = 100, overrides?: {
  db: SupabaseClient;
  queue: Pick<Queue, "getJob" | "add">;
  runIds: string[];
}) {
  const queue = overrides?.queue ?? generationQueue;
  if (!queue || overrides?.runIds.length === 0) return { scanned: 0, enqueued: 0 };
  const db = overrides?.db ?? createClient(process.env.SUPABASE_URL ?? "", process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = db.from("document_generation_runs")
    .select("id").eq("status", "queued").order("created_at", { ascending: true })
    .limit(Math.min(100, Math.max(1, Math.floor(limit) || 100)));
  if (overrides) query = query.in("id", overrides.runIds);
  const { data, error } = await query.abortSignal(AbortSignal.timeout(5000));
  if (error) throw new Error("Generation recovery could not read durable queued runs");
  let enqueued = 0;
  for (const run of data ?? []) {
    // A stable ID deduplicates concurrent dispatcher replicas and API enqueue.
    // Existing failed/completed jobs are not deleted or silently restarted.
    if (await queue.getJob(run.id)) continue;
    await queue.add("render-generation-run", { runId: run.id }, { jobId: run.id });
    enqueued += 1;
  }
  return { scanned: data?.length ?? 0, enqueued };
}
