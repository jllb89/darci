"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSignatureObjectMetadata = exports.getDocumentObjectMetadata = exports.createSignatureUploadUrl = exports.createDocumentUploadUrl = exports.notarizedBucket = exports.signaturesBucket = exports.documentsBucket = exports.supabaseStorage = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
exports.supabaseStorage = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
exports.documentsBucket = process.env.SUPABASE_STORAGE_BUCKET_DOCUMENTS ?? "documents";
exports.signaturesBucket = process.env.SUPABASE_STORAGE_BUCKET_SIGNATURES ?? "signatures";
exports.notarizedBucket = process.env.SUPABASE_STORAGE_BUCKET_NOTARIZED ?? "notarized-copies";
const createDocumentUploadUrl = async (storagePath) => {
    const { data, error } = await exports.supabaseStorage
        .storage
        .from(exports.documentsBucket)
        .createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Failed to create signed upload URL");
    }
    return {
        bucket: exports.documentsBucket,
        path: data.path,
        signedUrl: data.signedUrl,
        token: data.token,
    };
};
exports.createDocumentUploadUrl = createDocumentUploadUrl;
const createSignatureUploadUrl = async (storagePath) => {
    const { data, error } = await exports.supabaseStorage
        .storage
        .from(exports.signaturesBucket)
        .createSignedUploadUrl(storagePath);
    if (error || !data?.signedUrl) {
        throw new Error(error?.message ?? "Failed to create signed upload URL");
    }
    return {
        bucket: exports.signaturesBucket,
        path: data.path,
        signedUrl: data.signedUrl,
        token: data.token,
    };
};
exports.createSignatureUploadUrl = createSignatureUploadUrl;
const getDocumentObjectMetadata = async (storagePath) => {
    const segments = storagePath.split("/");
    const fileName = segments.pop();
    const directory = segments.join("/");
    if (!fileName) {
        return null;
    }
    const { data, error } = await exports.supabaseStorage
        .storage
        .from(exports.documentsBucket)
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
        mimeType: typeof metadata.mimetype === "string"
            ? metadata.mimetype
            : typeof metadata.contentType === "string"
                ? metadata.contentType
                : null,
    };
};
exports.getDocumentObjectMetadata = getDocumentObjectMetadata;
const getSignatureObjectMetadata = async (storagePath) => {
    const segments = storagePath.split("/");
    const fileName = segments.pop();
    const directory = segments.join("/");
    if (!fileName) {
        return null;
    }
    const { data, error } = await exports.supabaseStorage
        .storage
        .from(exports.signaturesBucket)
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
        mimeType: typeof metadata.mimetype === "string"
            ? metadata.mimetype
            : typeof metadata.contentType === "string"
                ? metadata.contentType
                : null,
    };
};
exports.getSignatureObjectMetadata = getSignatureObjectMetadata;
//# sourceMappingURL=storageService.js.map