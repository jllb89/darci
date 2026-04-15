"use client";

import { createContext, useContext } from "react";

export type AppToastTone = "success" | "error" | "warning";

export type AppToastInput = {
  tone: AppToastTone;
  message: string;
  durationMs?: number;
};

type AppToastContextValue = {
  showToast: (toast: AppToastInput) => void;
  clearToast: () => void;
};

const noop = () => {};

const AppToastContext = createContext<AppToastContextValue>({
  showToast: noop,
  clearToast: noop,
});

export const AppToastProvider = AppToastContext.Provider;

export const useAppToast = () => {
  return useContext(AppToastContext);
};