"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type PendingDirectItem = {
  partId: string;
  partNo: string;
  description: string;
  price: number;
};

type PendingOrderContextValue = {
  items: PendingDirectItem[];
  addItem: (item: PendingDirectItem) => void;
  removeItem: (partId: string) => void;
  updatePrice: (partId: string, price: number) => void;
  clear: () => void;
  count: number;
  isFinalizeOpen: boolean;
  openFinalize: () => void;
  closeFinalize: () => void;
};

const PendingOrderContext = createContext<PendingOrderContextValue | null>(null);

export function PendingOrderProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<PendingDirectItem[]>([]);
  const [isFinalizeOpen, setIsFinalizeOpen] = useState(false);

  const addItem = useCallback((item: PendingDirectItem) => {
    setItems((prev) => {
      if (prev.some((i) => i.partId === item.partId)) return prev;
      return [...prev, item];
    });
  }, []);

  const removeItem = useCallback((partId: string) => {
    setItems((prev) => prev.filter((i) => i.partId !== partId));
  }, []);

  const updatePrice = useCallback((partId: string, price: number) => {
    setItems((prev) =>
      prev.map((i) => (i.partId === partId ? { ...i, price } : i)),
    );
  }, []);

  const clear = useCallback(() => setItems([]), []);
  const openFinalize = useCallback(() => setIsFinalizeOpen(true), []);
  const closeFinalize = useCallback(() => setIsFinalizeOpen(false), []);

  const value = useMemo<PendingOrderContextValue>(
    () => ({
      items,
      addItem,
      removeItem,
      updatePrice,
      clear,
      count: items.length,
      isFinalizeOpen,
      openFinalize,
      closeFinalize,
    }),
    [items, addItem, removeItem, updatePrice, clear, isFinalizeOpen, openFinalize, closeFinalize],
  );

  return (
    <PendingOrderContext.Provider value={value}>
      {children}
    </PendingOrderContext.Provider>
  );
}

export function usePendingOrder() {
  const ctx = useContext(PendingOrderContext);
  if (!ctx) throw new Error("usePendingOrder must be used within PendingOrderProvider");
  return ctx;
}
