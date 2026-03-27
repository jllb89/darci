"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apiBaseUrl = process.env.API_BASE_URL;
const accessToken = process.env.ACCESS_TOKEN;
const skipLargeUpload = process.env.SKIP_LARGE_UPLOAD === "1";
if (!process.env.OTEL_SDK_DISABLED) {
    process.env.OTEL_SDK_DISABLED = "1";
}
if (!accessToken) {
    console.error("Missing ACCESS_TOKEN env var");
    process.exit(1);
}
if (!apiBaseUrl) {
    console.error("Missing API_BASE_URL env var");
    process.exit(1);
}
const jsonHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
};
const assert = (condition, message) => {
    if (!condition) {
        throw new Error(message);
    }
};
const assertStatus = (response, payload, expectedStatus, message) => {
    if (response.status !== expectedStatus) {
        console.error("Unexpected status", {
            expectedStatus,
            actualStatus: response.status,
            payload,
        });
        throw new Error(message);
    }
};
const assertTruthy = (value, message) => {
    if (!value) {
        throw new Error(message);
    }
};
const createPdfBuffer = (byteLength) => {
    const header = Buffer.from("%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Count 1 /Kids [3 0 R] >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>\nendobj\n4 0 obj\n<< /Length 44 >>\nstream\nBT /F1 12 Tf 72 120 Td (DARCI) Tj ET\nendstream\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n", "utf8");
    if (byteLength <= header.length) {
        return header;
    }
    const padding = Buffer.alloc(byteLength - header.length, 0x20);
    return Buffer.concat([header, padding]);
};
const createTextBuffer = (byteLength) => {
    const content = Buffer.from("not a pdf\n", "utf8");
    if (byteLength <= content.length) {
        return content;
    }
    const padding = Buffer.alloc(byteLength - content.length, 0x2e);
    return Buffer.concat([content, padding]);
};
const apiRequest = async (path, body) => {
    const response = await fetch(`${apiBaseUrl}${path}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    return { response, payload };
};
const createDocument = async (input) => {
    return apiRequest("/documents", {
        ...input,
    });
};
const finalizeUpload = async (documentId, documentVersionId) => {
    return apiRequest(`/documents/${documentId}/upload-finalize`, {
        documentVersionId,
    });
};
const uploadToSignedUrl = async (signedUrl, buffer, contentType) => {
    const response = await fetch(signedUrl, {
        method: "PUT",
        headers: {
            "Content-Type": contentType,
        },
        body: new Uint8Array(buffer),
    });
    if (!response.ok) {
        const body = await response.text().catch(() => "");
        throw new Error(`Signed upload failed: ${response.status} ${body}`);
    }
};
const runHappyPath = async () => {
    const pdfBuffer = createPdfBuffer(512 * 1024);
    const { response, payload } = await createDocument({
        fileName: "valid.pdf",
        fileSize: pdfBuffer.length,
        mimeType: "application/pdf",
        documentType: "generic",
        jurisdiction: "US-OH",
    });
    assertStatus(response, payload, 201, "Happy path create should return 201");
    const created = payload;
    assertTruthy(created.upload?.signedUrl, "Happy path upload URL missing");
    assertTruthy(created.document.id, "Happy path document id missing");
    assertTruthy(created.version.id, "Happy path version id missing");
    await uploadToSignedUrl(created.upload.signedUrl, pdfBuffer, "application/pdf");
    const finalizeResult = await finalizeUpload(created.document.id, created.version.id);
    assertStatus(finalizeResult.response, finalizeResult.payload, 200, "Finalize should return 200");
    const finalized = finalizeResult.payload;
    assertTruthy(finalized.document.idn, "Finalize should assign IDN");
    assert(finalized.document.status === "pending_signature", "Status should be pending_signature");
};
const runNonPdfCreateRejection = async () => {
    const { response } = await createDocument({
        fileName: "file.txt",
        fileSize: 120,
        mimeType: "text/plain",
    });
    assert(response.status === 400, "Non-PDF create should return 400");
};
const runOversizeCreateRejection = async () => {
    const { response } = await createDocument({
        fileName: "oversize.pdf",
        fileSize: 30 * 1024 * 1024,
        mimeType: "application/pdf",
    });
    assert(response.status === 400, "Oversize create should return 400");
};
const runNonPdfFinalizeRejection = async () => {
    const textBuffer = createTextBuffer(1024);
    const { response, payload } = await createDocument({
        fileName: "not-pdf.pdf",
        fileSize: textBuffer.length,
        mimeType: "application/pdf",
    });
    assert(response.status === 201, "Non-PDF finalize create should return 201");
    const created = payload;
    assertTruthy(created.upload?.signedUrl, "Non-PDF finalize upload URL missing");
    await uploadToSignedUrl(created.upload.signedUrl, textBuffer, "text/plain");
    const finalizeResult = await finalizeUpload(created.document.id, created.version.id);
    assertStatus(finalizeResult.response, finalizeResult.payload, 400, "Non-PDF finalize should return 400");
};
const runOversizeFinalizeRejection = async () => {
    if (skipLargeUpload) {
        console.warn("SKIP_LARGE_UPLOAD=1 set, skipping oversize upload test");
        return;
    }
    const oversizedBuffer = createPdfBuffer(26 * 1024 * 1024);
    const { response, payload } = await createDocument({
        fileName: "oversize-finalize.pdf",
        fileSize: 10 * 1024 * 1024,
        mimeType: "application/pdf",
    });
    assert(response.status === 201, "Oversize finalize create should return 201");
    const created = payload;
    assertTruthy(created.upload?.signedUrl, "Oversize finalize upload URL missing");
    await uploadToSignedUrl(created.upload.signedUrl, oversizedBuffer, "application/pdf");
    const finalizeResult = await finalizeUpload(created.document.id, created.version.id);
    assertStatus(finalizeResult.response, finalizeResult.payload, 400, "Oversize finalize should return 400");
};
const main = async () => {
    console.log("Running smoke tests...", { apiBaseUrl });
    await runHappyPath();
    console.log("Happy path: OK");
    await runNonPdfCreateRejection();
    console.log("Non-PDF create rejection: OK");
    await runOversizeCreateRejection();
    console.log("Oversize create rejection: OK");
    await runNonPdfFinalizeRejection();
    console.log("Non-PDF finalize rejection: OK");
    await runOversizeFinalizeRejection();
    console.log("Oversize finalize rejection: OK");
    console.log("Smoke tests complete.");
};
main().catch((error) => {
    console.error("Smoke test failed", error);
    process.exit(1);
});
//# sourceMappingURL=smoke-document-upload.js.map