"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const apiBaseUrl = process.env.API_BASE_URL;
const accessToken = process.env.ACCESS_TOKEN;
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
const assertTruthy = (value, message) => {
    if (!value) {
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
const createPngBuffer = (byteLength) => {
    const header = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c636000000200015d0f5b0b0000000049454e44ae426082", "hex");
    if (byteLength <= header.length) {
        return header;
    }
    const padding = Buffer.alloc(byteLength - header.length, 0x00);
    return Buffer.concat([header, padding]);
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
const createDocument = async () => {
    const response = await fetch(`${apiBaseUrl}/documents`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify({
            fileName: "source.pdf",
            fileSize: 1024,
            mimeType: "application/pdf",
            documentType: "generic",
            jurisdiction: "US-OH",
        }),
    });
    const payload = (await response.json().catch(() => ({})));
    assertStatus(response, payload, 201, "Document create should return 201");
    return payload.document.id;
};
const requestSignature = async (documentId, sizeBytes) => {
    return apiRequest(`/documents/${documentId}/signatures/request`, {
        fileName: "signature.png",
        fileSize: sizeBytes,
        mimeType: "image/png",
    });
};
const finalizeSignature = async (documentId, signatureId) => {
    return apiRequest(`/documents/${documentId}/signatures/finalize`, {
        signatureId,
    });
};
const main = async () => {
    console.log("Running signature smoke test...", { apiBaseUrl });
    const documentId = await createDocument();
    const pngBuffer = createPngBuffer(1024);
    const requestResult = await requestSignature(documentId, pngBuffer.length);
    assertStatus(requestResult.response, requestResult.payload, 201, "Signature request should return 201");
    const requestPayload = requestResult.payload;
    assertTruthy(requestPayload.signature?.id, "Signature id missing");
    assertTruthy(requestPayload.upload?.signedUrl, "Signed URL missing");
    await uploadToSignedUrl(requestPayload.upload.signedUrl, pngBuffer, "image/png");
    const finalizeResult = await finalizeSignature(documentId, requestPayload.signature.id);
    assertStatus(finalizeResult.response, finalizeResult.payload, 200, "Signature finalize should return 200");
    const finalizePayload = finalizeResult.payload;
    assert(finalizePayload.signature?.status === "captured", "Signature status should be captured");
    console.log("Signature smoke test complete.");
};
main().catch((error) => {
    console.error("Signature smoke test failed", error);
    process.exit(1);
});
//# sourceMappingURL=smoke-signature-upload.js.map