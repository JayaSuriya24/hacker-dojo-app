import type { Response } from 'express';
import { profileService } from '../services/profile.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import type { AuthenticatedRequest } from '../types/http.js';

/**
 * Controllers do three things and nothing else: read the (already validated)
 * request, call one service, shape the response. No branching on business
 * rules, no database access — that is what makes the services testable without
 * an HTTP layer.
 */
export const profileController = {
  me: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await profileService.me(req.context.user) });
  }),

  update: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await profileService.update(req.context.user, req.body) });
  }),

  notifications: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await profileService.notificationPreferences(req.context.user) });
  }),

  updateNotifications: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({
      data: await profileService.updateNotificationPreferences(req.context.user, req.body),
    });
  }),

  plans: asyncHandler(async (_req, res: Response) => {
    res.json({ data: await profileService.plans() });
  }),
};
