"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendValidationError = void 0;
const sendValidationError = (res, error) => {
    const details = error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
    }));
    res.status(400).json({
        error: "validation_error",
        message: "Invalid request",
        details,
    });
};
exports.sendValidationError = sendValidationError;
//# sourceMappingURL=validation.js.map