"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
process.env.NODE_OPTIONS = "";
process.env.OTEL_SDK_DISABLED = "true";
require("dotenv/config");
const supabase_js_1 = require("@supabase/supabase-js");
const supabaseUrl = process.env.SUPABASE_URL ?? "";
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseKey);
const getArg = (name) => {
    const index = process.argv.indexOf(`--${name}`);
    if (index === -1 || index + 1 >= process.argv.length) {
        return null;
    }
    return process.argv[index + 1];
};
const documentId = getArg("document-id");
const signatureId = getArg("signature-id");
if (!documentId) {
    console.error("Usage: ts-node scripts/verify-audit-events.ts --document-id <uuid> [--signature-id <uuid>]");
    process.exit(1);
}
const fetchByDocumentId = async (docId) => {
    const { data, error } = await supabase
        .from("audit_events")
        .select("action, entity_type, entity_id, metadata, created_at")
        .or(`entity_id.eq.${docId},metadata->>document_id.eq.${docId}`)
        .order("created_at", { ascending: true });
    if (error) {
        throw new Error(error.message);
    }
    return data ?? [];
};
const fetchBySignatureId = async (sigId) => {
    const { data, error } = await supabase
        .from("audit_events")
        .select("action, entity_type, entity_id, metadata, created_at")
        .or(`entity_id.eq.${sigId},metadata->>signature_id.eq.${sigId}`)
        .order("created_at", { ascending: true });
    if (error) {
        throw new Error(error.message);
    }
    return data ?? [];
};
const verifyActions = (actions, required) => {
    const missing = required.filter((action) => !actions.includes(action));
    return missing;
};
const main = async () => {
    const documentEvents = await fetchByDocumentId(documentId);
    const documentActions = documentEvents.map((event) => event.action);
    const requiredDocumentActions = [
        "member.document_upload_started",
        "member.document_upload_completed",
        "system.document_created",
        "system.document_idn_assigned",
    ];
    const missingDocument = verifyActions(documentActions, requiredDocumentActions);
    let missingSignature = [];
    if (signatureId) {
        const signatureEvents = await fetchBySignatureId(signatureId);
        const signatureActions = signatureEvents.map((event) => event.action);
        const requiredSignatureActions = [
            "member.signature_capture_started",
            "member.signature_capture_completed",
            "system.signature_linked_to_document",
        ];
        missingSignature = verifyActions(signatureActions, requiredSignatureActions);
    }
    const hasMissing = missingDocument.length > 0 || missingSignature.length > 0;
    console.log("Audit verification summary");
    console.log("- Document ID:", documentId);
    console.log("- Document events:", documentEvents.length);
    console.log("- Missing document actions:", missingDocument.length ? missingDocument.join(", ") : "none");
    if (signatureId) {
        console.log("- Signature ID:", signatureId);
        console.log("- Missing signature actions:", missingSignature.length
            ? missingSignature.join(", ")
            : "none");
    }
    process.exit(hasMissing ? 2 : 0);
};
main().catch((error) => {
    console.error("Audit verification failed:", error);
    process.exit(1);
});
//# sourceMappingURL=verify-audit-events.js.map