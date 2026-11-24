import { useCallback, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Persistent local storage helpers, backed by AsyncStorage on React Native.
 *
 * The web build used window.localStorage behind the same tiny store contract;
 * the mobile app keeps the same API so services and views port unchanged.
 */

interface PersistedStoreInternal {
  __version(): number;
}

export interface PersistedStore<T> {
  get(): T;
  set(value: T): void;
  update(updater: (value: T) => T): void;
  subscribe(listener: () => void): () => void;
}

export interface SessionStore<T> {
  get(): T;
  set(value: T): void;
  reset(): void;
}

export function createPersistedStore<T>(key: string, initial: T): PersistedStore<T> {
  let value = initial;
  let loaded = false;
  let version = 0;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) listener();
  };

  void (async () => {
    try {
      const raw = await AsyncStorage.getItem(key);
      // Merge over the initial defaults so keys added in newer versions of
      // the app always have a value, even in existing installs.
      if (raw !== null) value = { ...initial, ...(JSON.parse(raw) as T) };
    } catch {
      /* keep initial */
    } finally {
      loaded = true;
      version += 1;
      notify();
    }
  })();

  const commit = () => {
    version += 1;
    const snapshot = value;
    void AsyncStorage.setItem(key, JSON.stringify(snapshot)).catch(() => undefined);
    notify();
  };

  const store: PersistedStore<T> & Partial<PersistedStoreInternal> = {
    get: () => value,
    set: (next) => {
      value = next;
      commit();
    },
    update: (updater) => {
      value = updater(value);
      commit();
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    __version: () => {
      void loaded;
      return version;
    },
  };

  return store as PersistedStore<T>;
}

export function createSessionStore<T>(initial: T): SessionStore<T> {
  let value = initial;
  return {
    get: () => value,
    set: (next) => {
      value = next;
    },
    reset: () => {
      value = initial;
    },
  };
}

export async function readPersistedStore<T>(store: PersistedStore<T>): Promise<T> {
  return store.get();
}

/** Subscribe a component to a persisted store (re-renders on hydration and writes). */
export function usePersistedStore<T>(store: PersistedStore<T>): T {
  const getSnapshot = useCallback(() => store.get(), [store]);
  const subscribe = useCallback(
    (listener: () => void) => store.subscribe(listener),
    [store]
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
