import { create } from "zustand";
import { persist } from "zustand/middleware";

export type SelectedCar = {
  make: string;
  series?: string;
  generation?: string;
  model?: string;
};

type SelectedCarStore = {
  selectedCar: SelectedCar | null;
  setSelectedCar: (car: SelectedCar) => void;
  clearSelectedCar: () => void;
};

export const useSelectedCarStore = create<SelectedCarStore>()(
  persist(
    (set) => ({
      selectedCar: null,
      setSelectedCar: (car) => set({ selectedCar: car }),
      clearSelectedCar: () => set({ selectedCar: null }),
    }),
    { name: "selected-car" },
  ),
);
