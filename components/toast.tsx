"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import clsx from "clsx";
import { IconCheck, IconCopy } from "./icons";

export type ToastType = "success" | "info" | "error";

type Toast = {
  id: string;
  message: string;
  type: ToastType;
};

type ToastContextValue = {
  showToast: (message: string, type?: ToastType) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);
const TOAST_DURATION_MS = 3000;

const createToastId = (): string =>
  typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "success") => {
    const id = createToastId();
    const nextToast: Toast = { id, message, type };

    setToasts((current) => [...current, nextToast]);

    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id));
    }, TOAST_DURATION_MS);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <ToastContainer toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

function ToastContainer({ toasts }: { toasts: Toast[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex flex-col items-center gap-2 px-4 sm:bottom-6 lg:bottom-6">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={clsx(
            "pointer-events-auto glass animate-in slide-in-from-bottom-4 fade-in duration-300 flex items-center gap-3 rounded-2xl px-4 py-3 shadow-2xl backdrop-blur-xl",
            toast.type === "success" && "border-emerald-500/30 bg-emerald-500/10",
            toast.type === "error" && "border-red-500/30 bg-red-500/10",
            toast.type === "info" && "border-blue-500/30 bg-blue-500/10"
          )}
        >
          <div
            className={clsx(
              "flex h-8 w-8 items-center justify-center rounded-full",
              toast.type === "success" && "bg-emerald-500/20 text-emerald-400",
              toast.type === "error" && "bg-red-500/20 text-red-400",
              toast.type === "info" && "bg-blue-500/20 text-blue-400"
            )}
          >
            {toast.type === "success" && <IconCheck className="h-4 w-4" />}
            {toast.type === "info" && <IconCopy className="h-4 w-4" />}
          </div>
          <p className="text-sm font-medium text-white">{toast.message}</p>
        </div>
      ))}
    </div>
  );
}
