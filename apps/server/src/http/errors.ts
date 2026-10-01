import type { ErrorCode, ErrorResponse } from "@url-shortener/api";
import { NotFoundError } from "@url-shortener/engine";
import type { ErrorRequestHandler, Response } from "express";
import { z } from "zod";

export const sendError = (
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  fieldErrors?: Record<string, string[]>,
) => {
  const body: ErrorResponse = { error: { code, message, fieldErrors } };
  res.status(status).json(body);
};

/** The single place where errors become HTTP responses; every body matches ErrorResponse. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    const { fieldErrors } = z.flattenError(error);
    return sendError(res, 400, "VALIDATION_ERROR", "Invalid request", fieldErrors);
  }
  // body-parser errors: malformed JSON (400), body over the limit (413), etc.
  if (error?.type && typeof error.status === "number" && error.status < 500) {
    const message =
      error.type === "entity.parse.failed" ? "Request body is not valid JSON" : error.message;
    return sendError(res, error.status, "VALIDATION_ERROR", message);
  }
  if (error instanceof NotFoundError) {
    return sendError(res, 404, "NOT_FOUND", error.message);
  }
  console.error(error);
  sendError(res, 500, "INTERNAL_ERROR", "Something went wrong");
};
