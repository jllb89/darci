import { Response } from "express";
import { ZodError } from "zod";

type ValidationIssue = {
  path: string;
  message: string;
};

export const sendValidationError = (res: Response, error: ZodError) => {
  const details: ValidationIssue[] = error.errors.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));

  res.status(400).json({
    error: "validation_error",
    message: "Invalid request",
    details,
  });
};
