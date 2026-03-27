"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLedgerEntry = exports.createNotarizationRequest = exports.getDocumentById = exports.createDocument = void 0;
const pool_1 = require("./pool");
const createDocument = async () => {
    return pool_1.pool.query("SELECT 1");
};
exports.createDocument = createDocument;
const getDocumentById = async () => {
    return pool_1.pool.query("SELECT 1");
};
exports.getDocumentById = getDocumentById;
const createNotarizationRequest = async () => {
    return pool_1.pool.query("SELECT 1");
};
exports.createNotarizationRequest = createNotarizationRequest;
const createLedgerEntry = async () => {
    return pool_1.pool.query("SELECT 1");
};
exports.createLedgerEntry = createLedgerEntry;
//# sourceMappingURL=queries.js.map