/**
 * UI Store
 * Global UI state: toasts, modals, etc.
 */

import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  message: string;
  type: ToastType;
  id: number;
}

interface UIState {
  toast: ToastState | null;
  showToast: (message: string, type?: ToastType) => void;
  hideToast: () => void;
}

let toastId = 0;

export const useUIStore = create<UIState>((set) => ({
  toast: null,

  showToast: (message, type = 'info') => {
    toastId += 1;
    set({ toast: { message, type, id: toastId } });
  },

  hideToast: () => {
    set({ toast: null });
  },
}));
