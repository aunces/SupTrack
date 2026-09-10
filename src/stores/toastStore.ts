import { create } from 'zustand'
import { newId } from '@/utils/id'

export type ToastVariant = 'default' | 'destructive' | 'warning'

export interface ToastItem {
  id: string
  title: string
  description?: string
  variant: ToastVariant
}

interface ToastState {
  items: ToastItem[]
  push: (item: Omit<ToastItem, 'id' | 'variant'> & { variant?: ToastVariant }) => void
  dismiss: (id: string) => void
}

export const useToastStore = create<ToastState>((set) => ({
  items: [],
  push: (item) => {
    const toast: ToastItem = { id: newId(), variant: item.variant ?? 'default', ...item }
    set((state) => ({ items: [...state.items, toast] }))
    setTimeout(() => {
      set((state) => ({ items: state.items.filter((t) => t.id !== toast.id) }))
    }, 4000)
  },
  dismiss: (id) => set((state) => ({ items: state.items.filter((t) => t.id !== id) })),
}))

export function toast(
  title: string,
  options: { description?: string; variant?: ToastVariant } = {},
) {
  useToastStore.getState().push({ title, ...options })
}
