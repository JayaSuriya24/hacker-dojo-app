import type { Request, Response } from 'express';
import type { z } from 'zod';
import { bookingService } from '../services/booking.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { validatedQuery } from '../middleware/validate.js';
import type { availabilityQuery, listResourcesQuery } from '../validators/index.js';
import type { AuthenticatedRequest } from '../types/http.js';

export const bookingController = {
  listResources: asyncHandler(async (req: Request, res: Response) => {
    const query = validatedQuery<z.infer<typeof listResourcesQuery>>(req);
    res.json({ data: await bookingService.listResources(query.kind) });
  }),

  availability: asyncHandler(async (req: Request, res: Response) => {
    const query = validatedQuery<z.infer<typeof availabilityQuery>>(req);
    const data = await bookingService.availability(req.params['id'] as string, query.day);
    res.json({ data });
  }),

  listMine: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await bookingService.listMine(req.context.user) });
  }),

  create: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const booking = await bookingService.create(req.context.user, req.body);
    res.status(201).json({ data: booking });
  }),

  reschedule: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const booking = await bookingService.reschedule(
      req.context.user,
      req.params['id'] as string,
      req.body,
    );
    res.json({ data: booking });
  }),

  cancel: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    await bookingService.cancel(req.context.user, req.params['id'] as string);
    res.status(204).send();
  }),

  liveSession: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await bookingService.liveSession(req.context.user) });
  }),

  extendSession: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await bookingService.extendSession(req.context.user) });
  }),

  endSession: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await bookingService.endSession(req.context.user) });
  }),
};
