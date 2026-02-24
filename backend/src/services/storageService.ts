import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseStorage = createClient(supabaseUrl, supabaseKey);

const documentsBucket = process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS ?? "documents";
const signaturesBucket = process.env.SUPABASE_STORAGE_BUCKET_SIGNATURES ?? "signatures";
const notarizedBucket = process.env.SUPABASE_STORAGE_BUCKET_NOTARIZED ?? "notarized-copies";

export const uploadDocument = async (documentId: string, file: Buffer) => {
  const path = `${documentId}/source.pdf`;
  return {
    bucket: documentsBucket,
    path,
    message: "TODO: upload to Supabase Storage",
    bytes: file.length,
  };
};

export const uploadSignature = async (documentId: string, file: Buffer) => {
  const path = `${documentId}/signature.png`;
  return {
    bucket: signaturesBucket,
    path,
    message: "TODO: upload signature image",
    bytes: file.length,
  };
};

export const uploadNotarizedCopy = async (documentId: string, file: Buffer) => {
  const path = `${documentId}/notarized.pdf`;
  return {
    bucket: notarizedBucket,
    path,
    message: "TODO: upload notarized document",
    bytes: file.length,
  };
};
