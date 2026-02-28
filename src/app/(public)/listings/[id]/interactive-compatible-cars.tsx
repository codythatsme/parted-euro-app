"use client";

import { useState, useMemo } from "react";
import { cn } from "~/lib/utils";

// Define Car type directly in this file
type Car = {
  id: string;
  generation: string;
  series: string;
  model: string;
  body: string | null;
};

interface InteractiveCompatibleCarsProps {
  cars: Car[];
}

export function InteractiveCompatibleCars({
  cars,
}: InteractiveCompatibleCarsProps) {
  const [activeSeries, setActiveSeries] = useState<string | null>(null);

  // Group cars by series, generation, and model
  const carsBySeriesAndGeneration = useMemo(() => {
    const grouped: Record<
      string,
      {
        series: string;
        generations: Record<
          string,
          {
            generation: string;
            models: { model: string; body: string | null }[];
          }
        >;
      }
    > = {};

    // If no cars, return empty object
    if (!cars || cars.length === 0) {
      return grouped;
    }

    cars.forEach((car) => {
      const series = car.series || "Unknown";
      const generation = car.generation || "Unknown";
      const model = car.model || "Unknown";
      const body = car.body;

      if (!grouped[series]) {
        grouped[series] = {
          series,
          generations: {},
        };
      }

      if (!grouped[series].generations[generation]) {
        grouped[series].generations[generation] = {
          generation,
          models: [],
        };
      }

      // Check if model already exists to avoid duplicates
      const existingModelIndex = grouped[series].generations[
        generation
      ].models.findIndex((m) => m.model === model && m.body === body);

      if (existingModelIndex === -1) {
        grouped[series].generations[generation].models.push({
          model,
          body,
        });
      }
    });

    return grouped;
  }, [cars]);

  // Return early if no cars
  if (!cars || cars.length === 0) {
    return null;
  }

  // Set initial active series if not yet set
  if (
    activeSeries === null &&
    Object.keys(carsBySeriesAndGeneration).length > 0
  ) {
    const firstSeries = Object.keys(carsBySeriesAndGeneration)[0];
    if (firstSeries) {
      setActiveSeries(firstSeries);
    }
  }

  const seriesList = Object.keys(carsBySeriesAndGeneration).sort();
  const activeSeriesData =
    activeSeries && carsBySeriesAndGeneration[activeSeries]
      ? carsBySeriesAndGeneration[activeSeries]
      : null;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Compatible Vehicles</h3>
      <div className="flex gap-4 overflow-hidden rounded-md border">
        {/* Left side - vertical series tabs */}
        <div className="min-w-36 border-r bg-muted/30">
          <div className="px-1 py-2">
            {seriesList.map((series) => (
              <button
                key={series}
                onClick={() => setActiveSeries(series)}
                className={cn(
                  "w-full rounded-md px-3 py-2 text-left text-sm transition-colors",
                  activeSeries === series
                    ? "bg-primary text-primary-foreground"
                    : "hover:bg-muted",
                )}
              >
                {series}
              </button>
            ))}
          </div>
        </div>

        {/* Right side - generations and models table */}
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
                    {Object.values(activeSeriesData.generations).map((gen) => (
                      <tr key={gen.generation} className="hover:bg-muted/20">
                        <td className="px-3 py-2 align-top font-medium">
                          {gen.generation}
                        </td>
                        <td className="px-3 py-2">
                          <div className="grid gap-1">
                            {gen.models.map((model, idx) => (
                              <div key={idx} className="text-sm">
                                {model.model}
                                {model.body ? ` (${model.body})` : ""}
                              </div>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
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
