"use client";

type Car = {
  id: string;
  generation: string;
  series: string;
  model: string;
  body: string | null;
  engine: string | null;
};

interface CompatibleCarsProps {
  cars: Car[];
}

export function CompatibleCars({ cars }: CompatibleCarsProps) {
  if (!cars || cars.length === 0) {
    return null;
  }

  return (
    <div className="mt-2">
      <ul className="mt-1 list-inside list-disc text-sm">
        {cars.map((car, idx) => {
          // Create a display name for each car
          const parts = [
            car.generation,
            car.series,
            car.model,
            car.body,
            car.engine,
          ].filter(Boolean);

          const displayName = parts.join(" ");

          return <li key={car.id || idx}>{displayName}</li>;
        })}
      </ul>
    </div>
  );
}
