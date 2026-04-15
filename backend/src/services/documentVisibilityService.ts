export const shouldExposeDocumentIdn = (input: {
  idn: string | null;
  status: string | null;
  viewerRole?: string | null | undefined;
}) => {
  if (!input.idn) {
    return false;
  }

  if (input.viewerRole === "admin" || input.viewerRole === "service_role") {
    return true;
  }

  return (
    input.status === "pending_notary" ||
    input.status === "completed" ||
    input.status === "notarized"
  );
};

export const getVisibleDocumentIdn = (input: {
  idn: string | null;
  status: string | null;
  viewerRole?: string | null | undefined;
}) => {
  return shouldExposeDocumentIdn(input) ? input.idn : null;
};

const memberHiddenReviewOutputKeys = new Set(["trust_certificate"]);

export const shouldExposeDocumentReviewOutput = (input: {
  outputKey: string;
  viewerRole?: string | null | undefined;
}) => {
  if (input.viewerRole === "admin" || input.viewerRole === "service_role") {
    return true;
  }

  return !memberHiddenReviewOutputKeys.has(input.outputKey);
};