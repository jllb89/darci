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
    input.status === "pending_signature" ||
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

export const shouldExposeDocumentReviewOutput = (input: {
  outputKey: string;
  documentKey?: string | null | undefined;
  baseOutputKey?: string | null | undefined;
  viewerRole?: string | null | undefined;
}) => {
  return true;
};