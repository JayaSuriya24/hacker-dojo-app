import type { Response } from 'express';
import { documentService } from '../services/document.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedRequest } from '../types/http.js';
import type { DocumentKind, DocumentStatus } from '../types/database.js';

/** The steward review queue's page size. */
const PENDING_LIMIT = 50;

/**
 * Uploads arrive base64-encoded inside a JSON body rather than as multipart.
 *
 * The reason is the client: React Native's `FormData` file support differs
 * between platforms and Hermes versions, and the files here are small and
 * infrequent (one portrait, one student ID). One JSON body keeps the transport
 * identical to every other call — same envelope, same auth header, same error
 * shape — for a payload measured in hundreds of kilobytes.
 *
 * The size ceiling is enforced twice: Express caps the JSON body, and the
 * service checks the decoded byte length against the bucket's own limit.
 */
function decodeBase64(value: string, field: string): Buffer {
  // A data URL prefix is stripped rather than rejected — it is what the picker
  // hands back on web, and refusing it would be a platform-specific failure.
  const payload = value.includes(',') ? (value.split(',').pop() ?? '') : value;

  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(payload) || payload.length === 0) {
    throw AppError.badRequest(`${field} is not valid base64 content.`);
  }

  return Buffer.from(payload, 'base64');
}

export const documentController = {
  uploadAvatar: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as { fileName: string; mimeType: string; content: string };

    const result = await documentService.uploadAvatar(req.context.user, {
      fileName: body.fileName,
      mimeType: body.mimeType,
      body: decodeBase64(body.content, 'content'),
    });

    res.status(201).json({ data: result });
  }),

  deleteAvatar: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    await documentService.deleteAvatar(req.context.user);
    res.status(204).send();
  }),

  upload: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as {
      kind: DocumentKind;
      fileName: string;
      mimeType: string;
      content: string;
    };

    const result = await documentService.uploadDocument(req.context.user, {
      kind: body.kind,
      fileName: body.fileName,
      mimeType: body.mimeType,
      body: decodeBase64(body.content, 'content'),
    });

    res.status(201).json({ data: result });
  }),

  listMine: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.json({ data: await documentService.listMine(req.context.user) });
  }),

  detail: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const data = await documentService.detail(req.context.user, req.params['id'] as string);
    // The response carries a signed URL, so it must never be cached by a proxy.
    res.set('Cache-Control', 'no-store');
    res.json({ data });
  }),

  remove: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    await documentService.remove(req.context.user, req.params['id'] as string);
    res.status(204).send();
  }),

  listPending: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    res.set('Cache-Control', 'no-store');
    res.json({ data: await documentService.listPending(req.context.user, PENDING_LIMIT) });
  }),

  review: asyncHandler<AuthenticatedRequest>(async (req, res: Response) => {
    const body = req.body as {
      status: Exclude<DocumentStatus, 'submitted'>;
      reviewNote?: string;
    };

    const data = await documentService.review(req.context.user, req.params['id'] as string, {
      status: body.status,
      reviewNote: body.reviewNote,
    });

    res.json({ data });
  }),
};
