import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { type z, type ZodType } from 'zod';
import { AppError, type FieldIssue } from '../utils/errors.js';

/**
 * Schema-driven request validation.
 *
 * Two things happen here that matter beyond "is this valid":
 *
 * 1. The parsed value REPLACES the raw one. Downstream code sees only fields
 *    the schema declared, so an attacker cannot smuggle `role: "admin"` through
 *    a body that a service later spreads into an update.
 * 2. Failures come back as a per-field list the mobile form maps straight onto
 *    React Hook Form's `setError`, so server rules surface next to the input
 *    that broke them rather than in a generic banner.
 */

export interface RequestSchemas {
  body?: ZodType;
  query?: ZodType;
  params?: ZodType;
}

function toIssues(error: z.ZodError, source: string): FieldIssue[] {
  return error.issues.map((issue) => ({
    path: [source, ...issue.path.map(String)].filter(Boolean).join('.'),
    message: issue.message,
  }));
}

export function validate(schemas: RequestSchemas): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const issues: FieldIssue[] = [];

    if (schemas.params) {
      const result = schemas.params.safeParse(req.params);
      if (result.success) Object.assign(req.params, result.data);
      else issues.push(...toIssues(result.error, 'params'));
    }

    if (schemas.query) {
      const result = schemas.query.safeParse(req.query);
      if (result.success) {
        // Express 5 exposes `req.query` as a getter; stash the parsed value
        // where controllers read it from instead of assigning through.
        Object.defineProperty(req, 'validatedQuery', { value: result.data, configurable: true });
      } else {
        issues.push(...toIssues(result.error, 'query'));
      }
    }

    if (schemas.body) {
      const result = schemas.body.safeParse(req.body);
      if (result.success) req.body = result.data;
      else issues.push(...toIssues(result.error, 'body'));
    }

    if (issues.length > 0) {
      next(AppError.validation('Check the highlighted fields and try again.', issues));
      return;
    }

    next();
  };
}

/** Read the value produced by a `query` schema, typed. */
export function validatedQuery<T>(req: Request): T {
  return (req as Request & { validatedQuery: T }).validatedQuery;
}
