import { useState, useEffect } from "react";
import { api } from "~/trpc/react";
import { Button } from "~/components/ui/button";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "~/components/ui/dialog";

type SelectCarModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCarSelected: (carData: {
    make: string;
    series?: string;
    generation?: string;
    model?: string;
    engine?: string;
  }) => void;
};

export function SelectCarModal({
  open,
  onOpenChange,
  onCarSelected,
}: SelectCarModalProps) {
  // Track current step (0: make, 1: series, 2: generation, 3: model, 4: engine)
  const [step, setStep] = useState(0);

  // Store selections
  const [selectedMake, setSelectedMake] = useState<string>("");
  const [selectedSeries, setSelectedSeries] = useState<string>("");
  const [selectedGeneration, setSelectedGeneration] = useState<string>("");
  const [selectedModel, setSelectedModel] = useState<string>("");
  const [selectedEngine, setSelectedEngine] = useState<string>("");

  // Reset selections and step when modal opens
  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedMake("");
      setSelectedSeries("");
      setSelectedGeneration("");
      setSelectedModel("");
      setSelectedEngine("");
    }
  }, [open]);

  // Fetch data for each step
  const { data: makesData, isLoading: isLoadingMakes } =
    api.car.getAllMakes.useQuery();

  const { data: seriesData, isLoading: isLoadingSeries } =
    api.car.getMatchingSeries.useQuery(
      { make: selectedMake },
      { enabled: !!selectedMake },
    );

  const { data: generationsData, isLoading: isLoadingGenerations } =
    api.car.getMatchingGenerations.useQuery(
      { make: selectedMake, series: selectedSeries },
      { enabled: !!selectedMake && !!selectedSeries },
    );

  const { data: modelsData, isLoading: isLoadingModels } =
    api.car.getMatchingModels.useQuery(
      {
        make: selectedMake,
        series: selectedSeries,
        generation: selectedGeneration,
      },
      { enabled: !!selectedMake && !!selectedSeries && !!selectedGeneration },
    );

  const { data: enginesData, isLoading: isLoadingEngines } =
    api.car.getMatchingEngines.useQuery(
      {
        make: selectedMake,
        series: selectedSeries,
        generation: selectedGeneration,
        model: selectedModel,
      },
      {
        enabled:
          !!selectedMake &&
          !!selectedSeries &&
          !!selectedGeneration &&
          !!selectedModel,
      },
    );

  // Reset the selection process
  const resetSelections = () => {
    setStep(0);
    setSelectedMake("");
    setSelectedSeries("");
    setSelectedGeneration("");
    setSelectedModel("");
    setSelectedEngine("");
  };

  // Handle closing the dialog
  const handleOpenChange = (open: boolean) => {
    if (!open) {
      resetSelections();
    }
    onOpenChange(open);
  };

  // Navigate to next step
  const goToNextStep = () => {
    setStep((prev) => prev + 1);
  };

  // Navigate to previous step
  const goToPreviousStep = () => {
    setStep((prev) => prev - 1);
  };

  // Confirm current selection
  const confirmSelection = () => {
    onCarSelected({
      make: selectedMake,
      series: selectedSeries || undefined,
      generation: selectedGeneration || undefined,
      model: selectedModel || undefined,
      engine: selectedEngine || undefined,
    });
    onOpenChange(false);
  };

  // Handle selection for each step
  const handleMakeSelect = (make: string) => {
    setSelectedMake(make);
    setSelectedSeries("");
    setSelectedGeneration("");
    setSelectedModel("");
    setSelectedEngine("");
    goToNextStep();
  };

  const handleSeriesSelect = (series: string) => {
    setSelectedSeries(series);
    setSelectedGeneration("");
    setSelectedModel("");
    setSelectedEngine("");
    goToNextStep();
  };

  const handleGenerationSelect = (generation: string) => {
    setSelectedGeneration(generation);
    setSelectedModel("");
    setSelectedEngine("");
    goToNextStep();
  };

  const handleModelSelect = (model: string) => {
    setSelectedModel(model);
    setSelectedEngine("");
    goToNextStep();
  };

  const handleEngineSelect = (engine?: string) => {
    setSelectedEngine(engine ?? "");
    onCarSelected({
      make: selectedMake,
      series: selectedSeries,
      generation: selectedGeneration,
      model: selectedModel,
      engine,
    });
    onOpenChange(false);
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 0: // Make selection
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Select Car Make</DialogTitle>
              <DialogDescription>
                Choose the manufacturer of your vehicle
              </DialogDescription>
            </DialogHeader>

            {isLoadingMakes ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {makesData?.map((make) => (
                  <Button
                    key={make}
                    variant="outline"
                    className="justify-between px-4 py-6"
                    onClick={() => handleMakeSelect(make)}
                  >
                    <span>{make}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            )}
          </div>
        );

      case 1: // Series selection
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Select Series</DialogTitle>
              <DialogDescription>
                {selectedMake} &gt; Select series
              </DialogDescription>
            </DialogHeader>

            {isLoadingSeries ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {seriesData?.series.map((series) => (
                  <Button
                    key={series.value}
                    variant="outline"
                    className="justify-between px-4 py-6"
                    onClick={() => handleSeriesSelect(series.value)}
                  >
                    <span>{series.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={goToPreviousStep}>
                Back
              </Button>
              <Button variant="default" onClick={confirmSelection}>
                Confirm Selection
              </Button>
            </div>
          </div>
        );

      case 2: // Generation selection
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Select Generation</DialogTitle>
              <DialogDescription>
                {selectedMake} &gt; {selectedSeries} &gt; Select generation
              </DialogDescription>
            </DialogHeader>

            {isLoadingGenerations ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {generationsData?.generations.map((generation) => (
                  <Button
                    key={generation.value}
                    variant="outline"
                    className="justify-between px-4 py-6"
                    onClick={() => handleGenerationSelect(generation.value)}
                  >
                    <span>{generation.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={goToPreviousStep}>
                Back
              </Button>
              <Button variant="default" onClick={confirmSelection}>
                Confirm Selection
              </Button>
            </div>
          </div>
        );

      case 3: // Model selection
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Select Model</DialogTitle>
              <DialogDescription>
                {selectedMake} &gt; {selectedSeries} &gt; {selectedGeneration}{" "}
                &gt; Select model
              </DialogDescription>
            </DialogHeader>

            {isLoadingModels ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {modelsData?.models.map((model) => (
                  <Button
                    key={model.value}
                    variant="outline"
                    className="justify-between px-4 py-6"
                    onClick={() => handleModelSelect(model.value)}
                  >
                    <span>{model.label}</span>
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={goToPreviousStep}>
                Back
              </Button>
              <Button variant="default" onClick={confirmSelection}>
                Confirm Selection
              </Button>
            </div>
          </div>
        );

      case 4: // Engine selection
        return (
          <div className="space-y-4">
            <DialogHeader>
              <DialogTitle>Select Engine</DialogTitle>
              <DialogDescription>
                {selectedMake} &gt; {selectedSeries} &gt; {selectedGeneration}{" "}
                &gt; {selectedModel}
              </DialogDescription>
            </DialogHeader>

            {isLoadingEngines ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <Button
                  variant="outline"
                  className="justify-between px-4 py-6"
                  onClick={() => handleEngineSelect()}
                >
                  <span>Any engine</span>
                  <Check className="h-4 w-4" />
                </Button>
                {enginesData?.engines.map((engine) => (
                  <Button
                    key={engine.value}
                    variant="outline"
                    className="justify-between px-4 py-6"
                    onClick={() => handleEngineSelect(engine.value)}
                  >
                    <span>{engine.label}</span>
                    <Check className="h-4 w-4" />
                  </Button>
                ))}
              </div>
            )}

            <div className="flex justify-between pt-2">
              <Button variant="ghost" onClick={goToPreviousStep}>
                Back
              </Button>
              <Button variant="default" onClick={confirmSelection}>
                Confirm Selection
              </Button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-md md:max-w-lg">
        {renderStepContent()}
      </DialogContent>
    </Dialog>
  );
}
