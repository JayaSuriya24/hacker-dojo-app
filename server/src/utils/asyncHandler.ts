import type { NextFunction, Request, RequestHandler, Response } from 'express';

/**
 * Route a rejected promise into Express's error pipeline.
 *
 * Express 5 forwards async rejections on its own, but wrapping explicitly keeps
 * the behaviour independent of that and gives controllers a precise signature
 * to be typed against.
 */
export function asyncHandler<Req extends Request = Request>(
  handler: (req: Req, res: Response, next: NextFunction) => Promise<unknown>,
): RequestHandler {
  return (req, res, next) => {
    void handler(req as Req, res, next).catch(next);
  };
}
