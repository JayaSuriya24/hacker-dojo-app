import { adminClient, userClient } from '../config/supabase.js';
import { unwrap, unwrapList, unwrapMaybe } from '../utils/postgrest.js';
import type { DocumentKind, DocumentRow, DocumentStatus } from '../types/database.js';

const AVATAR_BUCKET = 'avatars';
const DOCUMENT_BUCKET = 'documents';

/** How long a signed document URL stays valid. Long enough to open, short enough not to leak. */
const SIGNED_URL_TTL_SECONDS = 300;

/**
 * Storage.
 *
 * Two buckets with opposite postures. `avatars` is public-read, so a member
 * card in the directory is one plain URL and thirty of them cost nothing;
 * `documents` is private, and every read is a short-lived signed URL minted per
 * request.
 *
 * Uploads run as the caller so the storage policies (first path segment is the
 * owner's uuid) still arbitrate. Only URL signing uses the service role, and
 * only after the caller's right to the row has been established above.
 */
export const storageRepository = {
  /**
   * Resolve a stored avatar path to the URL the app renders.
   *
   * This is the whole fix for blank avatars: the column holds
   * `<profile_id>/portrait.webp`, the client was handed that string as though
   * it were a URL, and `expo-image` quietly failed on it — while the initials
   * fallback stayed hidden because the value was truthy.
   *
   * Returns null for a null path so the caller keeps that fallback.
   */
  publicAvatarUrl(path: string | null): string | null {
    if (!path) return null;
    // Already absolute — a seeded or externally-hosted image.
    if (path.startsWith('http://') || path.startsWith('https://')) return path;

    const { data } = adminClient.storage.from(AVATAR_BUCKET).getPublicUrl(path);
    return data.publicUrl;
  },

  async uploadAvatar(
    accessToken: string,
    input: { profileId: string; fileName: string; contentType: string; body: Buffer },
  ): Promise<string> {
    // The path is derived, never taken from the client: the storage policy keys
    // on the first segment, so letting a caller name it would let them write to
    // someone else's folder.
    const path = `${input.profileId}/${input.fileName}`;

    const { error } = await userClient(accessToken)
      .storage.from(AVATAR_BUCKET)
      .upload(path, input.body, {
        contentType: input.contentType,
        // A member replacing their portrait overwrites it rather than
        // accumulating orphans nothing will ever clean up.
        upsert: true,
      });

    if (error) throw new Error(error.message);
    return path;
  },

  async removeAvatar(accessToken: string, path: string): Promise<void> {
    const { error } = await userClient(accessToken).storage.from(AVATAR_BUCKET).remove([path]);
    if (error) throw new Error(error.message);
  },

  async uploadDocument(
    accessToken: string,
    input: { profileId: string; fileName: string; contentType: string; body: Buffer },
  ): Promise<string> {
    const path = `${input.profileId}/${Date.now()}-${input.fileName}`;

    const { error } = await userClient(accessToken)
      .storage.from(DOCUMENT_BUCKET)
      .upload(path, input.body, { contentType: input.contentType, upsert: false });

    if (error) throw new Error(error.message);
    return path;
  },

  async removeDocument(accessToken: string, path: string): Promise<void> {
    const { error } = await userClient(accessToken).storage.from(DOCUMENT_BUCKET).remove([path]);
    if (error) throw new Error(error.message);
  },

  /** A short-lived URL for a private document. Minted only after RLS said yes. */
  async signDocument(path: string): Promise<string> {
    const { data, error } = await adminClient.storage
      .from(DOCUMENT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);

    if (error) throw new Error(error.message);
    return data.signedUrl;
  },
};

export interface CreateDocumentInput {
  profileId: string;
  kind: DocumentKind;
  storagePath: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}

/** The row that tells a steward a file is waiting and what it is meant to prove. */
export const documentRepository = {
  async create(accessToken: string, input: CreateDocumentInput): Promise<DocumentRow> {
    return unwrap(
      await userClient(accessToken)
        .from('documents')
        .insert({
          profile_id: input.profileId,
          kind: input.kind,
          storage_path: input.storagePath,
          file_name: input.fileName,
          mime_type: input.mimeType,
          size_bytes: input.sizeBytes,
        })
        .select('*')
        .single<DocumentRow>(),
      'Could not record that upload.',
    );
  },

  async listForProfile(accessToken: string, profileId: string): Promise<DocumentRow[]> {
    return unwrapList(
      await userClient(accessToken)
        .from('documents')
        .select('*')
        .eq('profile_id', profileId)
        .order('created_at', { ascending: false })
        .returns<DocumentRow[]>(),
      'Could not load your documents.',
    );
  },

  async findById(accessToken: string, id: string): Promise<DocumentRow | null> {
    return unwrapMaybe(
      await userClient(accessToken)
        .from('documents')
        .select('*')
        .eq('id', id)
        .maybeSingle<DocumentRow>(),
      'Could not load that document.',
    );
  },

  async remove(accessToken: string, id: string): Promise<void> {
    const { error } = await userClient(accessToken).from('documents').delete().eq('id', id);
    if (error) throw new Error(error.message);
  },

  /** Staff decision. The RLS policy pins this to `is_staff()`. */
  async review(
    accessToken: string,
    id: string,
    input: { status: DocumentStatus; reviewNote: string | null; reviewerId: string },
  ): Promise<DocumentRow> {
    return unwrap(
      await userClient(accessToken)
        .from('documents')
        .update({
          status: input.status,
          review_note: input.reviewNote,
          reviewed_by: input.reviewerId,
          reviewed_at: new Date().toISOString(),
        })
        .eq('id', id)
        .select('*')
        .single<DocumentRow>(),
      'Could not save that review.',
    );
  },

  async listPending(accessToken: string, limit: number): Promise<DocumentRow[]> {
    return unwrapList(
      await userClient(accessToken)
        .from('documents')
        .select('*')
        .eq('status', 'submitted')
        .order('created_at', { ascending: true })
        .limit(limit)
        .returns<DocumentRow[]>(),
      'Could not load pending documents.',
    );
  },
};
