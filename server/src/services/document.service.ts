import { env } from '../config/env.js';
import { documentRepository, storageRepository } from '../repositories/storage.repository.js';
import { profileRepository } from '../repositories/profile.repository.js';
import { AppError } from '../utils/errors.js';
import type { AuthenticatedUser } from '../types/http.js';
import type { DocumentKind, DocumentRow, DocumentStatus } from '../types/database.js';

export interface DocumentView {
  id: string;
  kind: DocumentKind;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  status: DocumentStatus;
  reviewNote: string | null;
  submittedAt: string;
  reviewedAt: string | null;
  /** Short-lived signed URL. Null in list responses, populated on detail. */
  url: string | null;
}

export interface AvatarView {
  avatarPath: string;
  avatarUrl: string;
}

/** What the buckets accept. Restated here so a bad upload is a 400, not a 500. */
const AVATAR_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const DOCUMENT_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/png'] as const;

const EXTENSION_BY_MIME: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'application/pdf': 'pdf',
};

function toView(row: DocumentRow, url: string | null): DocumentView {
  return {
    id: row.id,
    kind: row.kind,
    fileName: row.file_name,
    mimeType: row.mime_type,
    sizeBytes: row.size_bytes,
    status: row.status,
    reviewNote: row.review_note,
    submittedAt: row.created_at,
    reviewedAt: row.reviewed_at,
    url,
  };
}

/**
 * A filename safe to put in a storage key.
 *
 * The client's filename reaches the object store, so it is reduced to a known
 * alphabet rather than trusted: a name containing `../` or a null byte has no
 * business being concatenated into a path, even though the bucket policy would
 * still confine it to the caller's folder.
 */
function safeFileName(name: string, mimeType: string): string {
  const extension = EXTENSION_BY_MIME[mimeType] ?? 'bin';
  const base = name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');

  return `${base || 'upload'}.${extension}`;
}

/**
 * Uploads.
 *
 * Both flows share a shape: validate the bytes here, write them as the caller so
 * the storage policies still arbitrate, then record what happened. Neither uses
 * the service role to write — the "first path segment is the owner's uuid" rule
 * in the bucket policy is the actual protection and bypassing it would waste it.
 */
export const documentService = {
  /**
   * Replace the caller's avatar.
   *
   * Returns the resolved public URL alongside the path, so the client can render
   * immediately without a second round trip and without ever constructing a
   * storage URL itself — which is what it was doing wrong before.
   */
  async uploadAvatar(
    user: AuthenticatedUser,
    input: { fileName: string; mimeType: string; body: Buffer },
  ): Promise<AvatarView> {
    if (!AVATAR_MIME_TYPES.includes(input.mimeType as (typeof AVATAR_MIME_TYPES)[number])) {
      throw AppError.badRequest('Upload a JPEG, PNG or WebP image.');
    }
    if (input.body.byteLength > env.MAX_AVATAR_BYTES) {
      throw AppError.badRequest(
        `That image is larger than ${Math.round(env.MAX_AVATAR_BYTES / 1024 / 1024)}MB.`,
      );
    }

    // One canonical name per member: replacing a portrait overwrites it rather
    // than leaving orphans in the bucket that nothing will ever collect.
    const fileName = `portrait.${EXTENSION_BY_MIME[input.mimeType] ?? 'jpg'}`;

    const path = await storageRepository.uploadAvatar(user.accessToken, {
      profileId: user.id,
      fileName,
      contentType: input.mimeType,
      body: input.body,
    });

    await profileRepository.update(user.accessToken, user.id, { avatar_path: path });

    const url = storageRepository.publicAvatarUrl(path);
    if (!url) throw AppError.internal('Could not resolve that avatar.');

    return { avatarPath: path, avatarUrl: url };
  },

  async deleteAvatar(user: AuthenticatedUser): Promise<void> {
    const profile = await profileRepository.findById(user.id);
    if (!profile?.avatar_path) return;

    await storageRepository.removeAvatar(user.accessToken, profile.avatar_path);
    await profileRepository.update(user.accessToken, user.id, { avatar_path: null });
  },

  async uploadDocument(
    user: AuthenticatedUser,
    input: { kind: DocumentKind; fileName: string; mimeType: string; body: Buffer },
  ): Promise<DocumentView> {
    if (!DOCUMENT_MIME_TYPES.includes(input.mimeType as (typeof DOCUMENT_MIME_TYPES)[number])) {
      throw AppError.badRequest('Upload a PDF, JPEG or PNG.');
    }
    if (input.body.byteLength > env.MAX_DOCUMENT_BYTES) {
      throw AppError.badRequest(
        `That file is larger than ${Math.round(env.MAX_DOCUMENT_BYTES / 1024 / 1024)}MB.`,
      );
    }

    const fileName = safeFileName(input.fileName, input.mimeType);

    const path = await storageRepository.uploadDocument(user.accessToken, {
      profileId: user.id,
      fileName,
      contentType: input.mimeType,
      body: input.body,
    });

    const row = await documentRepository.create(user.accessToken, {
      profileId: user.id,
      kind: input.kind,
      storagePath: path,
      fileName,
      mimeType: input.mimeType,
      sizeBytes: input.body.byteLength,
    });

    return toView(row, null);
  },

  async listMine(user: AuthenticatedUser): Promise<DocumentView[]> {
    const rows = await documentRepository.listForProfile(user.accessToken, user.id);
    return rows.map((row) => toView(row, null));
  },

  /**
   * One document with a signed URL.
   *
   * The row is fetched as the caller first, so RLS decides whether they may see
   * it. Only then is the service role used to sign the object — signing before
   * the check would hand out a URL to anything whose id could be guessed.
   */
  async detail(user: AuthenticatedUser, id: string): Promise<DocumentView> {
    const row = await documentRepository.findById(user.accessToken, id);
    if (!row) throw AppError.notFound('That document is no longer available.');

    const url = await storageRepository.signDocument(row.storage_path);
    return toView(row, url);
  },

  async remove(user: AuthenticatedUser, id: string): Promise<void> {
    const row = await documentRepository.findById(user.accessToken, id);
    if (!row) throw AppError.notFound('That document is no longer available.');
    if (row.status !== 'submitted') {
      throw AppError.conflict('conflict', 'That document has already been reviewed.');
    }

    await documentRepository.remove(user.accessToken, id);
    await storageRepository.removeDocument(user.accessToken, row.storage_path);
  },

  /** Staff: the review queue, each row carrying a signed URL to open. */
  async listPending(user: AuthenticatedUser, limit: number): Promise<DocumentView[]> {
    const rows = await documentRepository.listPending(user.accessToken, limit);

    return Promise.all(
      rows.map(async (row) => toView(row, await storageRepository.signDocument(row.storage_path))),
    );
  },

  async review(
    user: AuthenticatedUser,
    id: string,
    input: { status: Exclude<DocumentStatus, 'submitted'>; reviewNote?: string | undefined },
  ): Promise<DocumentView> {
    const row = await documentRepository.review(user.accessToken, id, {
      status: input.status,
      reviewNote: input.reviewNote ?? null,
      reviewerId: user.id,
    });

    return toView(row, null);
  },
};
