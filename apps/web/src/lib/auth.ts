"use client";

import { useSyncExternalStore } from "react";

export const ACCESS_TOKEN_KEY = "darci.accessToken";
export const REFRESH_TOKEN_KEY = "darci.refreshToken";
export const USER_KEY = "darci.user";
const AUTH_STORAGE_EVENT = "darci-auth-storage";

export type StoredUserRole = "member" | "notary" | "admin";

export type StoredUser = {
  id: string;
  email: string;
  role: StoredUserRole;
  status: string;
  firstName?: string | null;
  lastName?: string | null;
};

type StoredAuth = {
  accessToken: string | null;
  refreshToken: string | null;
  user: StoredUser | null;
};

type CachedStoredAuth = {
  accessToken: string | null;
  refreshToken: string | null;
  rawUser: string | null;
  snapshot: StoredAuth;
};

const isBrowser = () => typeof window !== "undefined";

const emptyAuth: StoredAuth = {
  accessToken: null,
  refreshToken: null,
  user: null,
};

let cachedStoredAuth: CachedStoredAuth = {
  accessToken: null,
  refreshToken: null,
  rawUser: null,
  snapshot: emptyAuth,
};

const emitAuthChange = () => {
  if (!isBrowser()) {
    return;
  }

  window.dispatchEvent(new Event(AUTH_STORAGE_EVENT));
};

export const getStoredAuth = (): StoredAuth => {
  if (!isBrowser()) {
    return emptyAuth;
  }

  const accessToken = localStorage.getItem(ACCESS_TOKEN_KEY);
  const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);

   if (
    cachedStoredAuth.accessToken === accessToken &&
    cachedStoredAuth.refreshToken === refreshToken &&
    cachedStoredAuth.rawUser === rawUser
  ) {
    return cachedStoredAuth.snapshot;
  }

  let user: StoredUser | null = null;
  if (rawUser) {
    try {
      user = JSON.parse(rawUser) as StoredUser;
    } catch {
      user = null;
    }
  }

  const snapshot = { accessToken, refreshToken, user };

  cachedStoredAuth = {
    accessToken,
    refreshToken,
    rawUser,
    snapshot,
  };

  return snapshot;
};

export const hasStoredSession = () => Boolean(getStoredAuth().accessToken);

export const getStoredUser = () => getStoredAuth().user;

export const getStoredUserRole = (): StoredUserRole | null => {
  return getStoredUser()?.role ?? null;
};

export const setStoredAuth = (input: {
  accessToken?: string | null;
  refreshToken?: string | null;
  user?: unknown;
}) => {
  if (!isBrowser()) {
    return;
  }

  if (input.accessToken) {
    localStorage.setItem(ACCESS_TOKEN_KEY, input.accessToken);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  }

  if (input.refreshToken) {
    localStorage.setItem(REFRESH_TOKEN_KEY, input.refreshToken);
  } else {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  if (typeof input.user !== "undefined") {
    localStorage.setItem(USER_KEY, JSON.stringify(input.user));
  }

  emitAuthChange();
};

export const clearStoredAuth = () => {
  if (!isBrowser()) {
    return;
  }

  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  localStorage.removeItem(USER_KEY);

  emitAuthChange();
};

const subscribeToAuth = (onChange: () => void) => {
  if (!isBrowser()) {
    return () => undefined;
  }

  const handleStorage = (event: StorageEvent) => {
    if (
      event.key === ACCESS_TOKEN_KEY ||
      event.key === REFRESH_TOKEN_KEY ||
      event.key === USER_KEY ||
      event.key === null
    ) {
      onChange();
    }
  };

  window.addEventListener("storage", handleStorage);
  window.addEventListener(AUTH_STORAGE_EVENT, onChange);

  return () => {
    window.removeEventListener("storage", handleStorage);
    window.removeEventListener(AUTH_STORAGE_EVENT, onChange);
  };
};

export const useStoredAuth = () => {
  return useSyncExternalStore(subscribeToAuth, getStoredAuth, () => emptyAuth);
};

export const useStoredSession = () => Boolean(useStoredAuth().accessToken);

export const useStoredUser = () => useStoredAuth().user;