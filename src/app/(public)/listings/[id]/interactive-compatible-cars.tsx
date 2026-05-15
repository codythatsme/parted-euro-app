"use client";

import { useMemo, useState } from "react";
import { cn } from "~/lib/utils";
import { useSelectedCarStore } from "~/stores/useSelectedCarStore";

type Car = {
  id: string;
  generation: string;
  series: string;
  model: string;
  body: string | null;
};

type ModelEntry = { model: string; body: string | null };

interface InteractiveCompatibleCarsProps {
  cars: Car[];
}

export function InteractiveCompatibleCars({
  cars,
}: InteractiveCompatibleCarsProps) {
  const selectedCar = useSelectedCarStore((s) => s.selectedCar);

  const carsBySeriesAndGeneration = useMemo(() => {
    const grouped: Record<
      string,
      {
        series: string;
        generations: Record<
          string,
          { generation: string; models: ModelEntry[] }
        >;
      }
    > = {};

    cars.forEach((car) => {
      const series = car.series || "Unknown";
      const generation = car.generation || "Unknown";
      const model = car.model || "Unknown";
      const body = car.body;

      const seriesEntry = (grouped[series] ??= { series, generations: {} });
      const genEntry = (seriesEntry.generations[generation] ??= {
        generation,
        models: [],
      });

      const duplicate = genEntry.models.some(
        (m) => m.model === model && m.body === body,
      );
      if (!duplicate) genEntry.models.push({ model, body });
    });

    return grouped;
  }, [cars]);

  // Identify which series / generation / model in this listing matches the
  // user's selected car. Series-only match is enough to surface the series tab;
  // generation match drives the row highlight; model match drives the callout.
  const match = useMemo(() => {
    if (!selectedCar) return null;
    const seriesMatch = selectedCar.series
      ? carsBySeriesAndGeneration[selectedCar.series]?.series ?? null
      : null;
    if (!seriesMatch) return null;
    const generations = carsBySeriesAndGeneration[seriesMatch]?.generations;
    const generationMatch =
      selectedCar.generation && generations?.[selectedCar.generation]
        ? selectedCar.generation
        : null;
    return {
      series: seriesMatch,
      generation: generationMatch,
      model: selectedCar.model ?? null,
    };
  }, [selectedCar, carsBySeriesAndGeneration]);

  const seriesList = useMemo(() => {
    const list = Object.keys(carsBySeriesAndGeneration).sort();
    if (!match?.series) return list;
    return [match.series, ...list.filter((s) => s !== match.series)];
  }, [carsBySeriesAndGeneration, match?.series]);

  // The user can override the active series by clicking. Default to the
  // matched series (or the first series) otherwise.
  const [userActiveSeries, setUserActiveSeries] = useState<string | null>(null);
  const activeSeries =
    userActiveSeries ?? match?.series ?? seriesList[0] ?? null;

  if (cars.length === 0) return null;

  const activeSeriesData = activeSeries
    ? carsBySeriesAndGeneration[activeSeries]
    : null;

  const generationsForActive = activeSeriesData
    ? Object.values(activeSeriesData.generations)
    : [];

  // Within the active series, float the matched generation to the top.
  const sortedGenerations =
    activeSeries === match?.series && match?.generation
      ? [
          ...generationsForActive.filter(
            (g) => g.generation === match.generation,
          ),
          ...generationsForActive.filter(
            (g) => g.generation !== match.generation,
          ),
        ]
      : generationsForActive;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Compatible Vehicles</h3>
      <div className="flex gap-4 overflow-hidden rounded-md border">
        <div className="min-w-36 border-r bg-muted/30">
          <div className="px-1 py-2">
            {seriesList.map((series) => {
              const isMatch = series === match?.series;
              const isActive = activeSeries === series;
              return (
                <button
                  key={series}
                  onClick={() => setUserActiveSeries(series)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-muted",
                  )}
                >
                  <span>{series}</span>
                  {isMatch && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        isActive
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-amber-200 text-amber-900",
                      )}
                    >
                      Yours
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 p-3">
          {activeSeriesData ? (
            <div className="space-y-2">
              <div className="overflow-hidden rounded-md border">
                <table className="w-full">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Generation
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                        Models
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortedGenerations.map((gen) => {
                      const isMatchedGeneration =
                        activeSeries === match?.series &&
                        gen.generation === match?.generation;
                      return (
                        <tr
                          key={gen.generation}
                          className={cn(
                            "transition-colors",
                            isMatchedGeneration
                              ? "bg-amber-50"
                              : "hover:bg-muted/20",
                          )}
                        >
                          <td className="px-3 py-2 align-top font-medium">
                            {gen.generation}
                          </td>
                          <td className="px-3 py-2">
                            <div className="grid gap-1">
                              {gen.models.map((m, idx) => {
                                const isMatchedModel =
                                  isMatchedGeneration &&
                                  match?.model === m.model;
                                return (
                                  <div
                                    key={idx}
                                    className="flex items-center gap-3 text-sm"
                                  >
                                    <span
                                      className={cn(
                                        isMatchedModel &&
                                          "font-semibold text-amber-900",
                                      )}
                                    >
                                      {m.model}
                                      {m.body ? ` (${m.body})` : ""}
                                    </span>
                                    {isMatchedModel && <FitsYourCarCallout />}
                                  </div>
                                );
                              })}
                              {isMatchedGeneration && !match?.model && (
                                <FitsYourCarCallout />
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              Select a series to view compatible models
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FitsYourCarCallout() {
  return (
    <span className="inline-flex items-center gap-1 leading-none">
      <CurlyArrow className="h-7 w-9 -translate-y-1 text-amber-600" />
      <span className="font-handwritten text-xl font-bold text-amber-600 -rotate-[4deg]">
        Fits your car!
      </span>
    </span>
  );
}

function CurlyArrow({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 40"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M58 6 C 48 4, 38 12, 36 20 C 35 26, 42 30, 46 26 C 50 22, 42 16, 32 20 C 22 24, 14 32, 8 32" />
      <path d="M14 26 L 8 32 L 14 38" />
    </svg>
  );
}
