import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

export const supabaseStorage = createClient(supabaseUrl, supabaseKey);

export const documentsBucket =
  process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS ?? "documents";
export const signaturesBucket =
  process.env.SUPABASE_STORAGE_BUCKET_SIGNATURES ?? "signatures";
export const notarizedBucket =
  process.env.SUPABASE_STORAGE_BUCKET_NOTARIZED ?? "notarized-copies";

export const createDocumentUploadUrl = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed upload URL");
  }

  return {
    bucket: documentsBucket,
    path: data.path,
    signedUrl: data.signedUrl,
    token: data.token,
  };
};

export const getDocumentObjectMetadata = async (storagePath: string) => {
  const segments = storagePath.split("/");
  const fileName = segments.pop();
  const directory = segments.join("/");

  if (!fileName) {
    return null;
  }

  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .list(directory, { limit: 200 });

  if (error) {
    throw new Error(error.message);
  }

  const match = data?.find((item) => item.name === fileName);
  if (!match) {
    return null;
  }

  const metadata = match.metadata ?? {};

  return {
    sizeBytes: typeof metadata.size === "number" ? metadata.size : null,
    mimeType:
      typeof metadata.mimetype === "string"
        ? metadata.mimetype
        : typeof metadata.contentType === "string"
          ? metadata.contentType
          : null,
  };
};
