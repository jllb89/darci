const stringifyTraceMetadata = (metadata: Record<string, unknown>) => {
  try {
    return JSON.stringify(metadata, null, 2);
  } catch (error) {
    return JSON.stringify(
      {
        serializationError: true,
        message:
          error instanceof Error
            ? error.message
            : "Failed to serialize document trace metadata.",
      },
      null,
      2,
    );
  }
};

export const logDocumentTrace = (
  stage: string,
  metadata: Record<string, unknown>,
) => {
  if (process.env.NODE_ENV === "test") {
    return;
  }

  console.info(`[document-trace] ${stage}\n${stringifyTraceMetadata(metadata)}`);
};