import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';

/**
 * Local photo outbox — "take photo now, submit when signed in".
 *
 * When a visitor photographs an outcrop without an account, the capture is
 * saved on the phone (a copy of the image file plus its caption and capture
 * time). The moment they sign in, the outbox is offered back on the submit
 * screen: one tap stages the saved photos so sending them makes them part of
 * the contributor's own Geoscience Passport information. Nothing leaves the
 * device until the contributor sends it.
 */

const OUTBOX_KEY = 'et_photo_outbox.v1';
const OUTBOX_DIR = `${FileSystem.documentDirectory ?? ''}outbox/`;

export interface OutboxPhoto {
  id: string;
  /** 'primary' photos lead a Passport; 'supporting' are extra angles/clips. */
  slot: 'primary' | 'supporting';
  kind: 'image' | 'video';
  fileName: string;
  mimeType: string;
  /** A file URI inside the app's own outbox directory. */
  fileUri: string;
  caption: string;
  savedAt: string;
}

export async function loadOutbox(): Promise<OutboxPhoto[]> {
  try {
    const raw = await AsyncStorage.getItem(OUTBOX_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as OutboxPhoto[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function persist(entries: OutboxPhoto[]): Promise<void> {
  await AsyncStorage.setItem(OUTBOX_KEY, JSON.stringify(entries));
}

/** Writes a staged photo (raw base64) into the app's outbox directory. */
export async function saveBase64ToOutbox(
  entry: Omit<OutboxPhoto, 'id' | 'savedAt' | 'fileUri'>,
  base64: string
): Promise<OutboxPhoto> {
  try {
    await FileSystem.makeDirectoryAsync(OUTBOX_DIR, { intermediates: true });
  } catch {
    // exists already
  }
  const id = `out_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const ext = (entry.fileName.match(/\.([a-z0-9]+)$/i)?.[1] ?? 'jpg').toLowerCase();
  const destUri = `${OUTBOX_DIR}${id}.${ext}`;
  try {
    await FileSystem.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  } catch {
    throw new Error('The photo could not be saved on this phone.');
  }
  const saved: OutboxPhoto = { ...entry, id, fileUri: destUri, savedAt: new Date().toISOString() };
  const next = [...(await loadOutbox()), saved].slice(-20);
  await persist(next);
  return saved;
}

/** Reads a saved photo back as raw base64 (for staging it again). */
export async function readOutboxBase64(entry: OutboxPhoto): Promise<string> {
  return FileSystem.readAsStringAsync(entry.fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
}

/** Removes entries after they have been staged (or sent) successfully. */
export async function removeFromOutbox(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  const all = await loadOutbox();
  const removeSet = new Set(ids);
  await persist(all.filter((entry) => !removeSet.has(entry.id)));
  for (const entry of all) {
    if (removeSet.has(entry.id)) {
      void FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => undefined);
    }
  }
}

/** Deletes every saved photo and the index — used for "discard saved photos". */
export async function clearOutbox(): Promise<void> {
  const all = await loadOutbox();
  for (const entry of all) {
    void FileSystem.deleteAsync(entry.fileUri, { idempotent: true }).catch(() => undefined);
  }
  await AsyncStorage.removeItem(OUTBOX_KEY);
}
