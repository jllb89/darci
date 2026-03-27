"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deliverWebhook = void 0;
const deliverWebhook = async (url, payload) => {
    return {
        url,
        payload,
        status: "queued",
        message: "TODO: send webhook via HTTP client",
    };
};
exports.deliverWebhook = deliverWebhook;
//# sourceMappingURL=webhookService.js.map