import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from './logger';

/**
 * Credential storage.
 *
 * Session tokens go to the iOS Keychain / Android Keystore via SecureStore —
 * never to AsyncStorage, which is a plain unencrypted file that any process
 * with filesystem access on a rooted device can read.
 *
 * Two constraints shape this module:
 *
 * 1. SecureStore has a ~2KB per-value ceiling. A Supabase session with a long
 *    refresh token can exceed it, so values are chunked across keys and
 *    reassembled on read.
 * 2. SecureStore has no web implementation. The web target falls back to
 *    AsyncStorage with the downgrade logged, because silently pretending a
 *    value is encrypted when it is not is the worse failure.
 */

const CHUNK_SIZE = 1800;
const isWeb = Platform.OS === 'web';

// The downgrade the header promises is announced here, once, rather than on
// every read: a value stored on web is NOT encrypted, and a silent fallback
// would let that pass for Keychain storage.
if (isWeb) {
  logger.warn('SecureStore has no web implementation — falling back to unencrypted AsyncStorage.');
}

const options: SecureStore.SecureStoreOptions = {
  // Available after the first unlock, so a background refresh can still read
  // the session, but not while the device has never been unlocked since boot.
  keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
};

function chunkKey(key: string, index: number): string {
  return `${key}__${index}`;
}

async function setRaw(key: string, value: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, options);
}

async function getRaw(key: string): Promise<string | null> {
  if (isWeb) return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key, options);
}

async function deleteRaw(key: string): Promise<void> {
  if (isWeb) {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key, options);
}

export const secureStorage = {
  async getItem(key: string): Promise<string | null> {
    try {
      const head = await getRaw(key);
      if (head === null) return null;

      // A chunked value stores its part count under the base key.
      const chunkCount = Number(head);
      if (!Number.isInteger(chunkCount) || chunkCount <= 0 || !head.startsWith('__chunks__')) {
        return head.startsWith('__chunks__') ? null : head;
      }
      return head;
    } catch (error) {
      logger.warn('Secure storage read failed', { key, error });
      return null;
    }
  },

  async setItem(key: string, value: string): Promise<void> {
    try {
      if (value.length <= CHUNK_SIZE) {
        await this.removeItem(key);
        await setRaw(key, value);
        return;
      }

      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK_SIZE) {
        chunks.push(value.slice(i, i + CHUNK_SIZE));
      }

      await Promise.all(chunks.map((chunk, index) => setRaw(chunkKey(key, index), chunk)));
      await setRaw(key, `__chunks__${chunks.length}`);
    } catch (error) {
      // A failed credential write means the next launch asks for sign-in
      // again. Annoying, but far better than crashing the auth flow.
      logger.error('Secure storage write failed', { key, error });
    }
  },

  async removeItem(key: string): Promise<void> {
    try {
      const head = await getRaw(key);
      if (head?.startsWith('__chunks__')) {
        const count = Number(head.replace('__chunks__', ''));
        await Promise.all(
          Array.from({ length: count }, (_, index) => deleteRaw(chunkKey(key, index))),
        );
      }
      await deleteRaw(key);
    } catch (error) {
      logger.warn('Secure storage delete failed', { key, error });
    }
  },
};

/**
 * The adapter shape Supabase expects. Reassembles chunked values on read,
 * which the plain `secureStorage.getItem` above deliberately does not do
 * (it returns the marker so callers can tell the difference).
 */
export const supabaseSecureStorageAdapter = {
  async getItem(key: string): Promise<string | null> {
    try {
      const head = await getRaw(key);
      if (head === null) return null;
      if (!head.startsWith('__chunks__')) return head;

      const count = Number(head.replace('__chunks__', ''));
      const parts = await Promise.all(
        Array.from({ length: count }, (_, index) => getRaw(chunkKey(key, index))),
      );

      // A missing chunk means a partially-written session; treat it as absent
      // rather than handing Supabase a truncated token.
      if (parts.some((part) => part === null)) {
        logger.warn('Discarding a partially written session', { key });
        return null;
      }
      return parts.join('');
    } catch (error) {
      logger.warn('Session read failed', { key, error });
      return null;
    }
  },

  setItem: (key: string, value: string): Promise<void> => secureStorage.setItem(key, value),
  removeItem: (key: string): Promise<void> => secureStorage.removeItem(key),
};
