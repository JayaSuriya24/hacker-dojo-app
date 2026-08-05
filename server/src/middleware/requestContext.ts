import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

/**
 * Every request gets an id, echoed back in the `X-Request-Id` header and in
 * every error body. When a member reports "it said something went wrong", that
 * id is the difference between finding the log line and guessing.
 *
 * An inbound id is honoured only if it looks like an id — otherwise a caller
 * could inject newlines into the log stream.
 */
const SAFE_ID = /^[A-Za-z0-9_-]{8,64}$/;

export function requestContext(req: Request, res: Response, next: NextFunction): void {
  const inbound = req.get('x-request-id');
  const requestId = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();

  req.context = { requestId };
  res.setHeader('X-Request-Id', requestId);
  next();
}
