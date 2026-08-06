import { api } from '~/services/api/client';
import type { AvatarUploadResult, DocumentKind, MemberDocument } from '~/types/domain';

/**
 * Uploads.
 *
 * Bodies are base64 inside JSON rather than multipart. React Native's
 * `FormData` file support differs across platforms and Hermes versions, and
 * these payloads are small and rare — one portrait, one student ID — so one
 * transport that is identical to every other call in the app is worth more than
 * the ~33% encoding overhead.
 *
 * A longer timeout than the default 15s: a few hundred kilobytes over a phone
 * connection in the building's basement is slower than a JSON round trip.
 */
const UPLOAD_TIMEOUT_MS = 60_000;

export const uploadsApi = {
  uploadAvatar: (input: { fileName: string; mimeType: string; content: string }) =>
    api.post<AvatarUploadResult>('/me/avatar', input, {
      timeoutMs: UPLOAD_TIMEOUT_MS,
      retry: false,
    }),

  deleteAvatar: () => api.delete<void>('/me/avatar'),

  listDocuments: () => api.get<MemberDocument[]>('/me/documents'),

  uploadDocument: (input: {
    kind: DocumentKind;
    fileName: string;
    mimeType: string;
    content: string;
  }) =>
    api.post<MemberDocument>('/me/documents', input, {
      timeoutMs: UPLOAD_TIMEOUT_MS,
      retry: false,
    }),

  document: (id: string) => api.get<MemberDocument>(`/me/documents/${id}`),

  deleteDocument: (id: string) => api.delete<void>(`/me/documents/${id}`),
};
