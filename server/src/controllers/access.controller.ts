import type { Response } from 'express';
import { accessService } from '../services/access.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AuthenticatedRequest } from '../types/http.js';

/** How many door events the history endpoint returns. One screenful. */
const HISTORY_LIMIT = 20;

export const accessController = {
  digitalKey: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await accessService.digitalKey(req.context.user) });
  }),

  unlock: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as { deviceHint?: string };
    const result = await accessService.unlock(req.context.user, { deviceHint: body.deviceHint });
    res.status(201).json({ data: result });
  }),

  history: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await accessService.history(req.context.user, HISTORY_LIMIT) });
  }),
};
