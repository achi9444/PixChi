import type { Response } from 'express';

export type ApiErrorBody = {
  code: string;
  message: string;
  details?: unknown;
};

export function sendApiError(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown
) {
  const body: ApiErrorBody = { code, message };
  if (details !== undefined) body.details = details;
  return res.status(status).json(body);
}

