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

export const createDocumentDownloadUrl = async (
  storagePath: string,
  expiresInSeconds = 60 * 60,
) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed download URL");
  }

  return {
    bucket: documentsBucket,
    path: storagePath,
    signedUrl: data.signedUrl,
    expiresInSeconds,
  };
};

const toBuffer = async (value: Blob | ArrayBuffer | Uint8Array) => {
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  return Buffer.from(await value.arrayBuffer());
};

export const downloadDocumentObject = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(documentsBucket)
    .download(storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download document object");
  }

  return toBuffer(data);
};

export const createSignatureUploadUrl = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
    .createSignedUploadUrl(storagePath);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed upload URL");
  }

  return {
    bucket: signaturesBucket,
    path: data.path,
    signedUrl: data.signedUrl,
    token: data.token,
  };
};

export const createSignatureDownloadUrl = async (
  storagePath: string,
  expiresInSeconds = 60 * 60,
) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
    .createSignedUrl(storagePath, expiresInSeconds);

  if (error || !data?.signedUrl) {
    throw new Error(error?.message ?? "Failed to create signed signature URL");
  }

  return {
    bucket: signaturesBucket,
    path: storagePath,
    signedUrl: data.signedUrl,
    expiresInSeconds,
  };
};

export const downloadSignatureAsset = async (storagePath: string) => {
  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
    .download(storagePath);

  if (error || !data) {
    throw new Error(error?.message ?? "Failed to download signature asset");
  }

  return toBuffer(data);
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

export const uploadGeneratedDocument = async (input: {
  storagePath: string;
  content: Buffer;
  contentType: string;
}) => {
  const { error } = await supabaseStorage.storage.from(documentsBucket).upload(
    input.storagePath,
    input.content,
    {
      contentType: input.contentType,
      upsert: true,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    bucket: documentsBucket,
    path: input.storagePath,
    sizeBytes: input.content.byteLength,
    mimeType: input.contentType,
  };
};

export const getSignatureObjectMetadata = async (storagePath: string) => {
  const segments = storagePath.split("/");
  const fileName = segments.pop();
  const directory = segments.join("/");

  if (!fileName) {
    return null;
  }

  const { data, error } = await supabaseStorage
    .storage
    .from(signaturesBucket)
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

export const uploadSignatureAsset = async (input: {
  storagePath: string;
  content: Buffer;
  contentType: string;
}) => {
  const { error } = await supabaseStorage.storage.from(signaturesBucket).upload(
    input.storagePath,
    input.content,
    {
      contentType: input.contentType,
      upsert: true,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return {
    bucket: signaturesBucket,
    path: input.storagePath,
    sizeBytes: input.content.byteLength,
    mimeType: input.contentType,
  };
};
