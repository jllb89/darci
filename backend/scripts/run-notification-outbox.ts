import { runDueNotificationJobs } from "../src/services/notificationOutboxService";

const parseLimit = () => {
  const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
  const rawLimit = limitArg?.split("=")[1] ?? process.env.NOTIFICATION_OUTBOX_RUN_LIMIT ?? "25";
  const parsed = Number.parseInt(rawLimit, 10);

  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, 100) : 25;
};

const parseStringArg = (name: string) => {
  const arg = process.argv.find((value) => value.startsWith(`--${name}=`));
  return arg?.split("=")[1]?.trim() || null;
};

const main = async () => {
  const jobKind = parseStringArg("kind");
  const documentId = parseStringArg("document-id");
  const result = await runDueNotificationJobs({
    limit: parseLimit(),
    workerId: process.env.NOTIFICATION_OUTBOX_WORKER_ID ?? "local-manual",
    jobKind,
    documentId,
  });

  if (process.argv.includes("--verbose")) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const statusCounts = result.jobs.reduce<Record<string, number>>((counts, job) => {
    counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, {});
  const attemptedDeliveryCount = result.jobs.reduce(
    (total, job) => total + job.attemptedDeliveryCount,
    0,
  );
  const deliveredCount = result.jobs.reduce(
    (total, job) => total + job.deliveredCount,
    0,
  );
  const failedCount = result.jobs.reduce((total, job) => total + job.failedCount, 0);
  const failedJobs = result.jobs.filter((job) => job.failedCount > 0 || job.status === "failed");

  console.log(
    [
      "Notification outbox run complete.",
      `filters kind=${jobKind ?? "all"} documentId=${documentId ?? "all"}`,
      `scanned=${result.scannedCount} claimed=${result.claimedCount} processed=${result.processedCount}`,
      `deliveries attempted=${attemptedDeliveryCount} delivered=${deliveredCount} failed=${failedCount}`,
      `job statuses=${JSON.stringify(statusCounts)}`,
      failedJobs.length > 0
        ? `failed job ids=${failedJobs.map((job) => job.jobId).join(",")}`
        : "failed job ids=none",
      "Use --verbose to print every processed job.",
    ].join("\n"),
  );
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
