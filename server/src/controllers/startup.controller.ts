import type { Request, Response } from 'express';
import type { z } from 'zod';
import { startupService } from '../services/startup.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validatedQuery } from '../middleware/validate.js';
import type {
  createStartupSchema,
  reorderStartupsSchema,
  startupQuery,
  updateStartupSchema,
} from '../validators/index.js';
import type { AuthenticatedRequest } from '../types/http.js';

export const startupController = {
  /**
   * The public list.
   *
   * Search and filter are optional query parameters on the SAME endpoint rather
   * than a second route: with no parameters this is byte-for-byte the response
   * the tab has always received, so nothing that already calls it changes.
   */
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = validatedQuery<z.infer<typeof startupQuery>>(req);

    const found = query.search
      ? await startupService.searchStartups(query.search)
      : await startupService.getStartup();

    const data = startupService.filterStartups(found, {
      stage: query.stage,
      hiring: query.hiring === undefined ? undefined : query.hiring === 'true',
    });

    res.json({ data });
  }),

  /** Takes either a uuid or a slug — the service decides which. */
  detail: asyncHandler(async (req: Request, res: Response) => {
    const key = req.params['key'] as string;
    res.json({ data: await startupService.getStartupByIdOrSlug(key) });
  }),

  create: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as z.infer<typeof createStartupSchema>;
    res
      .status(201)
      .json({ data: await startupService.createStartup(req.context.user.accessToken, body) });
  }),

  update: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as z.infer<typeof updateStartupSchema>;
    const data = await startupService.updateStartup(
      req.context.user.accessToken,
      req.params['id'] as string,
      body,
    );
    res.json({ data });
  }),

  remove: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    await startupService.deleteStartup(req.context.user.accessToken, req.params['id'] as string);
    res.status(204).send();
  }),

  reorder: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as z.infer<typeof reorderStartupsSchema>;
    res.json({
      data: await startupService.reorderStartups(req.context.user.accessToken, body.orderedIds),
    });
  }),
};
