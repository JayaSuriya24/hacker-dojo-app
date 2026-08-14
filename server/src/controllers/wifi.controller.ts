import type { Response } from 'express';
import { wifiService } from '../services/wifi.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AuthenticatedRequest } from '../types/http.js';

export const wifiController = {
  credential: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await wifiService.credentialFor(req.context.user) });
  }),

  rotate: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await wifiService.rotateFor(req.context.user) });
  }),
};
