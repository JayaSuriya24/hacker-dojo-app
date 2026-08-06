import type { Request, Response } from 'express';
import { type z } from 'zod';
import { eventService } from '../services/event.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validatedQuery } from '../middleware/validate.js';
import { type listEventsQuery } from '../validators/index.js';
import type { AuthenticatedRequest } from '../types/http.js';

type ListQuery = z.infer<typeof listEventsQuery>;

export const eventController = {
  list: asyncHandler(async (req: Request, res: Response) => {
    const query = validatedQuery<ListQuery>(req);

    const data = await eventService.list(req.context.user, {
      category: query.category,
      todayOnly: query.today,
      limit: query.limit,
      offset: query.offset,
    });

    res.json({ data, meta: { limit: query.limit, offset: query.offset, count: data.length } });
  }),

  detail: asyncHandler(async (req: Request, res: Response) => {
    res.json({ data: await eventService.detail(req.context.user, req.params['id'] as string) });
  }),

  rsvp: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const result = await eventService.rsvp(req.context.user, req.params['id'] as string);
    res.status(201).json({ data: result });
  }),

  cancelRsvp: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    await eventService.cancelRsvp(req.context.user, req.params['id'] as string);
    res.status(204).send();
  }),

  requestToHost: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const result = await eventService.requestToHost(req.context.user, req.body);
    res.status(201).json({ data: result });
  }),
};
