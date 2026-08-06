import { useCallback } from 'react';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { uploadsApi } from '../api/uploads.api';
import { queryKeys } from '~/services/queryKeys';
import { QUERY_STALE_TIME } from '~/constants/config';
import { useAuth } from '~/providers/AuthProvider';
import { logger } from '~/services/logger';
import { ApiError } from '~/services/api/errors';
import type { DocumentKind } from '~/types/domain';

/**
 * Uploads.
 *
 * `expo-image-picker` was already a dependency with no call sites, and the
 * checkout copy told members to "upload a current student ID from Profile &
 * settings" — a screen that did not exist. Both flows live here.
 *
 * The picker's own editor does the cropping: it is the native square cropper on
 * both platforms, which members already know, and it means no crop UI has to be
 * built or maintained. What the picker cannot do is bound the result, so every
 * image is resized and re-encoded before it leaves the device — a 12-megapixel
 * portrait is 4MB of JPEG that would be rendered at 46 points.
 */

/** The longest edge an avatar is stored at. 512 covers @3x at every size used. */
const AVATAR_MAX_EDGE = 512;
const AVATAR_QUALITY = 0.82;

/** Documents are read by a human, so they keep more detail than an avatar. */
const DOCUMENT_MAX_EDGE = 2000;
const DOCUMENT_QUALITY = 0.9;

export interface PreparedImage {
  content: string;
  mimeType: 'image/jpeg';
  fileName: string;
  width: number;
  height: number;
}

/**
 * Resize, re-encode and base64 an image the picker returned.
 *
 * `base64: true` on the manipulator rather than reading the file separately:
 * one pass, and the string never has to be loaded from disk a second time.
 */
async function prepareImage(
  uri: string,
  maxEdge: number,
  quality: number,
  fileName: string,
): Promise<PreparedImage> {
  const result = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxEdge } }], {
    compress: quality,
    format: ImageManipulator.SaveFormat.JPEG,
    base64: true,
  });

  if (!result.base64) {
    throw new ApiError({
      code: 'bad_request',
      message: 'We could not read that image. Try another one.',
    });
  }

  return {
    content: result.base64,
    mimeType: 'image/jpeg',
    fileName,
    width: result.width,
    height: result.height,
  };
}

/**
 * Ask for library access.
 *
 * Requested at the moment the member taps "Change photo" rather than at launch:
 * a permission prompt before the member has expressed the intent is the
 * reliable way to earn a permanent denial.
 */
async function ensureLibraryPermission(): Promise<boolean> {
  const current = await ImagePicker.getMediaLibraryPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;

  const requested = await ImagePicker.requestMediaLibraryPermissionsAsync();
  return requested.granted;
}

export function useAvatarUpload() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: (image: PreparedImage) =>
      uploadsApi.uploadAvatar({
        fileName: image.fileName,
        mimeType: image.mimeType,
        content: image.content,
      }),

    onSuccess: (result) => {
      // Patch the cached profile rather than invalidating, so the new portrait
      // appears the instant the request lands instead of after a refetch.
      queryClient.setQueryData(queryKeys.me.profile(), (previous: unknown) =>
        previous && typeof previous === 'object'
          ? { ...previous, avatarPath: result.avatarPath, avatarUrl: result.avatarUrl }
          : previous,
      );
      // The member's own card in the directory is now stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.community.all() });
    },
  });

  /**
   * Pick, crop, compress and upload in one call, so a screen owns a button
   * rather than a four-step flow.
   *
   * Returns null when the member cancelled — which is a decision, not a failure,
   * and must not surface as an error banner.
   */
  const pickAndUpload = useCallback(async (): Promise<{ cancelled: boolean }> => {
    const granted = await ensureLibraryPermission();
    if (!granted) {
      throw new ApiError({
        code: 'forbidden',
        message: 'Photo access is off. Turn it on for Hacker Dojo in your device settings.',
      });
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // The platform's own square cropper — the crop step, without a crop UI.
      allowsEditing: true,
      aspect: [1, 1],
      quality: 1,
      exif: false,
    });

    if (picked.canceled || !picked.assets[0]) return { cancelled: true };

    const prepared = await prepareImage(
      picked.assets[0].uri,
      AVATAR_MAX_EDGE,
      AVATAR_QUALITY,
      'portrait.jpg',
    );

    logger.debug('Uploading avatar', { bytes: prepared.content.length });
    await mutation.mutateAsync(prepared);
    return { cancelled: false };
  }, [mutation]);

  return { ...mutation, pickAndUpload };
}

export function useDeleteAvatar() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: uploadsApi.deleteAvatar,
    onSuccess: () => {
      queryClient.setQueryData(queryKeys.me.profile(), (previous: unknown) =>
        previous && typeof previous === 'object'
          ? { ...previous, avatarPath: null, avatarUrl: null }
          : previous,
      );
      void queryClient.invalidateQueries({ queryKey: queryKeys.community.all() });
    },
  });
}

export function useMyDocuments() {
  const { isAuthenticated } = useAuth();

  return useQuery({
    queryKey: queryKeys.uploads.documents(),
    queryFn: uploadsApi.listDocuments,
    enabled: isAuthenticated,
    staleTime: QUERY_STALE_TIME.standard,
  });
}

export function useDocumentUpload() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: uploadsApi.uploadDocument,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.uploads.documents() });
    },
  });

  /**
   * Photograph or pick a document.
   *
   * Images only rather than a general document picker: the two things this is
   * for — a student ID and a DD-214 — are almost always photographed, and
   * restricting the type means the compression path above applies to everything
   * that arrives.
   */
  const pickAndUpload = useCallback(
    async (kind: DocumentKind): Promise<{ cancelled: boolean }> => {
      const granted = await ensureLibraryPermission();
      if (!granted) {
        throw new ApiError({
          code: 'forbidden',
          message: 'Photo access is off. Turn it on for Hacker Dojo in your device settings.',
        });
      }

      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
        exif: false,
      });

      if (picked.canceled || !picked.assets[0]) return { cancelled: true };

      const asset = picked.assets[0];
      const prepared = await prepareImage(
        asset.uri,
        DOCUMENT_MAX_EDGE,
        DOCUMENT_QUALITY,
        asset.fileName ?? `${kind}.jpg`,
      );

      await mutation.mutateAsync({
        kind,
        fileName: prepared.fileName,
        mimeType: prepared.mimeType,
        content: prepared.content,
      });

      return { cancelled: false };
    },
    [mutation],
  );

  return { ...mutation, pickAndUpload };
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => uploadsApi.deleteDocument(id),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.uploads.documents() });
    },
  });
}
