import type { Response } from 'express';
import type { z } from 'zod';
import { staffService } from '../services/staff.service.js';
import { contentService } from '../services/content.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validatedQuery } from '../middleware/validate.js';
import type { staffQueueQuery } from '../validators/index.js';
import type { AuthenticatedRequest } from '../types/http.js';
import type { ApplicationStatus, TourStatus } from '../types/database.js';

export const staffController = {
  dashboard: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    // Counts move constantly and are cheap to recompute; caching them would
    // mean a steward marking a tour confirmed watches the badge not change.
    res.set('Cache-Control', 'no-store');
    res.json({ data: await staffService.dashboard(req.context.user) });
  }),

  queue: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const query = validatedQuery<z.infer<typeof staffQueueQuery>>(req);

    const data = await staffService.queue(req.context.user, {
      status: query.status,
      kind: query.kind,
      limit: query.limit,
    });

    res.set('Cache-Control', 'no-store');
    res.json({ data, meta: { limit: query.limit, count: data.length } });
  }),

  setTourStatus: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as { status: TourStatus };
    const data = await staffService.setTourStatus(
      req.context.user,
      req.params['id'] as string,
      body.status,
    );
    res.json({ data });
  }),

  setEventRequestStatus: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as { status: ApplicationStatus };
    const data = await staffService.setEventRequestStatus(
      req.context.user,
      req.params['id'] as string,
      body.status,
    );
    res.json({ data });
  }),

  setApplicationStatus: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as { status: ApplicationStatus };
    const data = await staffService.setApplicationStatus(
      req.context.user,
      req.params['id'] as string,
      body.status,
    );
    res.json({ data });
  }),

  grantCertification: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as { profileId: string; resourceId: string; expiresAt?: string };
    const data = await staffService.grantCertification(req.context.user, body);
    res.status(201).json({ data });
  }),

  revokeCertification: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    await staffService.revokeCertification(req.context.user, req.params['id'] as string);
    res.status(204).send();
  }),

  listCertifications: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const data = await staffService.listCertifications(
      req.context.user,
      req.params['id'] as string,
    );
    res.json({ data });
  }),

  listContent: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ data: await contentService.listContentBlocks(req.context.user) });
  }),

  upsertContent: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as {
      slot: string;
      key: string;
      label: string;
      value?: string;
      sortOrder?: number;
      active?: boolean;
    };
    res.json({ data: await contentService.upsertContentBlock(req.context.user, body) });
  }),

  upsertSetting: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as {
      key: string;
      value: string;
      description?: string;
      membersOnly?: boolean;
    };
    res.json({ data: await contentService.upsertSetting(req.context.user, body) });
  }),
};
