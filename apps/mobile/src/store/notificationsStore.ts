import { create } from 'zustand';

interface NotificationsState {
  unreadCount: number;
  incrementUnread: () => void;
  clearUnread: () => void;
}

export const useNotificationsStore = create<NotificationsState>((set) => ({
  unreadCount: 0,
  incrementUnread: () => set((state) => ({ unreadCount: state.unreadCount + 1 })),
  clearUnread: () => set({ unreadCount: 0 }),
}));
