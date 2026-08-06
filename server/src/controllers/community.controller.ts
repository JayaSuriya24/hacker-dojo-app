import type { Request, Response } from 'express';
import type { z } from 'zod';
import { communityService } from '../services/community.service.js';
import { contentService } from '../services/content.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validatedQuery } from '../middleware/validate.js';
import type { directoryQuery } from '../validators/index.js';
import type { AuthenticatedRequest } from '../types/http.js';

export const communityController = {
  directory: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const query = validatedQuery<z.infer<typeof directoryQuery>>(req);

    const data = await communityService.directory(req.context.user, {
      search: query.search,
      skills: query.skills,
      onlyHere: query.here,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({ data, meta: { limit: query.limit, offset: query.offset, count: data.length } });
  }),

  member: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await communityService.member(req.context.user, req.params['id'] as string) });
  }),

  startups: asyncHandler(async (_req: Request, res: Response) => {
    res.json({ data: await communityService.startups() });
  }),

  occupancy: asyncHandler(async (_req: Request, res: Response) => {
    // Short public cache: the dial is live-ish, and a stampede of 300 members
    // opening the app at 9am should not become 300 identical queries.
    res.set('Cache-Control', 'public, max-age=15');
    res.json({ data: await communityService.occupancy() });
  }),

  programs: asyncHandler(async (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data: await contentService.programs() });
  }),

  about: asyncHandler(async (_req: Request, res: Response) => {
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ data: await contentService.about() });
  }),

  /**
   * Site settings for this caller.
   *
   * `private` rather than `public` in the cache header: the members-only rows
   * (the Wi-Fi password) differ per caller, and a shared cache keyed on the URL
   * alone would serve one member's response to a signed-out visitor.
   */
  settings: asyncHandler(async (req: Request, res: Response) => {
    res.set('Cache-Control', 'private, max-age=60');
    res.json({ data: await contentService.settings(req.context.user) });
  }),

  bookTour: asyncHandler(async (req: Request, res: Response) => {
    const tour = await contentService.bookTour(req.context.user, req.body);
    res.status(201).json({ data: tour });
  }),
};
