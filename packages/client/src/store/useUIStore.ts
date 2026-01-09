import { create } from 'zustand';

export type ToastType = 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  message: string;
}

type ModalName =
  | 'newPrompt'
  | 'versions'
  | 'compare'
  | 'debugDetail'
  | 'newEvaluation'
  | 'deleteConfirm'
  | 'editCriterion'
  | 'attachmentPreview';

interface UIState {
  // Toast
  toasts: Toast[];
  showToast: (type: ToastType, message: string) => void;
  removeToast: (id: string) => void;

  // Modal states
  modals: Record<ModalName, boolean>;
  openModal: (modal: ModalName) => void;
  closeModal: (modal: ModalName) => void;
  toggleModal: (modal: ModalName) => void;
  closeAllModals: () => void;

  // Sidebar
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
}

const initialModals: Record<ModalName, boolean> = {
  newPrompt: false,
  versions: false,
  compare: false,
  debugDetail: false,
  newEvaluation: false,
  deleteConfirm: false,
  editCriterion: false,
  attachmentPreview: false,
};

export const useUIStore = create<UIState>((set) => ({
  // Toast state
  toasts: [],

  showToast: (type, message) => {
    const id = Math.random().toString(36).slice(2);
    let added = false;

    set(state => {
      // Avoid duplicate toasts (common in React StrictMode / repeated errors)
      if (state.toasts.some(t => t.type === type && t.message === message)) {
        return state;
      }

      added = true;
      return {
        toasts: [...state.toasts, { id, type, message }],
      };
    });

    if (!added) return;

    // Auto remove after 3 seconds
    setTimeout(() => {
      set(state => ({
        toasts: state.toasts.filter(t => t.id !== id),
      }));
    }, 3000);
  },

  removeToast: (id) => {
    set(state => ({
      toasts: state.toasts.filter(t => t.id !== id),
    }));
  },

  // Modal state
  modals: { ...initialModals },

  openModal: (modal) => {
    set(state => ({
      modals: { ...state.modals, [modal]: true },
    }));
  },

  closeModal: (modal) => {
    set(state => ({
      modals: { ...state.modals, [modal]: false },
    }));
  },

  toggleModal: (modal) => {
    set(state => ({
      modals: { ...state.modals, [modal]: !state.modals[modal] },
    }));
  },

  closeAllModals: () => {
    set({ modals: { ...initialModals } });
  },

  // Sidebar state
  sidebarCollapsed: false,

  toggleSidebar: () => {
    set(state => ({ sidebarCollapsed: !state.sidebarCollapsed }));
  },

  setSidebarCollapsed: (collapsed) => {
    set({ sidebarCollapsed: collapsed });
  },
}));

// Compatibility hook - maintains the same API as the old useToast
export function useToast() {
  const showToast = useUIStore(state => state.showToast);
  return { showToast };
}
