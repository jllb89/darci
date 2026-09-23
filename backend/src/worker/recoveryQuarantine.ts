/** Restored databases must never replay provider side effects by default. */
export function isRecoveryQuarantined(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.APP_ENV === "recovery" || env.RECOVERY_QUARANTINE === "true" || env.RECOVERY_QUARANTINE === "1";
}
