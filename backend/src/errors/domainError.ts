export type DomainErrorFamily =
  | "validation"
  | "dependency"
  | "storage"
  | "template_source"
  | "generation"
  | "signing"
  | "notification"
  | "auth"
  | "internal";

type DomainErrorInput = {
  code: string;
  family: DomainErrorFamily;
  message: string;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class DomainError extends Error {
  readonly code: string;
  readonly family: DomainErrorFamily;
  readonly details?: Record<string, unknown>;

  constructor(input: DomainErrorInput) {
    super(input.message, input.cause !== undefined ? { cause: input.cause } : undefined);
    this.name = "DomainError";
    this.code = input.code;
    this.family = input.family;
    if (input.details !== undefined) {
      this.details = input.details;
    }
  }
}

export const isDomainError = (value: unknown): value is DomainError => {
  return value instanceof DomainError;
};

export const getErrorTelemetryFields = (error: unknown) => {
  if (isDomainError(error)) {
    return {
      code: error.code,
      family: error.family,
      name: error.name,
      details: error.details ?? null,
    };
  }

  return {
    code: "UNCLASSIFIED_ERROR",
    family: "internal" as const,
    name: error instanceof Error ? error.name : "Error",
    details: null,
  };
};