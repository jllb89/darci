"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.hashDocument = void 0;
const crypto_1 = __importDefault(require("crypto"));
const hashDocument = async (documentId, content) => {
    const source = content ?? documentId;
    const hash = crypto_1.default.createHash("sha256").update(source).digest("hex");
    return { documentId, hash };
};
exports.hashDocument = hashDocument;
//# sourceMappingURL=hashingService.js.map