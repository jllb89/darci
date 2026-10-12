type IntakeContext = {
  ownerId: string;
  mode: string;
  jurisdiction: string;
  resumeDocumentId: string;
  retryAttempt: number;
};

// A refreshed access token is a credential change, not a new document workflow.
// Identity and explicit form selections/retries still require initialization.
export function intakeInitializationKey(context: IntakeContext): string {
  return JSON.stringify([
    context.ownerId,
    context.mode,
    context.jurisdiction,
    context.resumeDocumentId,
    context.retryAttempt,
  ]);
}

export function mergeIntakeConflictAnswers(
  serverValues: Record<string, FormValue>,
  currentValues: Record<string, FormValue>,
): Record<string, FormValue> {
  // Keep even intentional empty values. A response to an older save is not
  // authority to replace what the user has typed since that save started.
  return { ...serverValues, ...currentValues };
}
import type { FormValue } from "./startPageTypes";
