"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const hashingService_1 = require("../../src/services/hashingService");
(0, vitest_1.describe)("hashDocument", () => {
    (0, vitest_1.it)("returns a sha256 hash", async () => {
        const result = await (0, hashingService_1.hashDocument)("doc-123");
        (0, vitest_1.expect)(result).toEqual({
            documentId: "doc-123",
            hash: "f6a86db1cdc697588795b4e21b11606d3cc5311c3c79c570480d6fbd5f286188",
        });
    });
});
//# sourceMappingURL=hashingService.test.js.map