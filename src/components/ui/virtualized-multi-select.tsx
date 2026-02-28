"use client";

import * as React from "react";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronsUpDown, X } from "lucide-react";

export type VirtualizedOption = {
  value: string;
  label: string;
};

interface VirtualizedMultiSelectCommandProps {
  height?: string;
  options: VirtualizedOption[];
  placeholder: string;
  selectedOptions: string[];
  onSelectOption?: (option: string) => void;
}

export const VirtualizedMultiSelectCommand = ({
  height = "400px",
  options,
  placeholder,
  selectedOptions,
  onSelectOption,
}: VirtualizedMultiSelectCommandProps) => {
  const [filteredOptions, setFilteredOptions] =
    React.useState<VirtualizedOption[]>(options);
  const [focusedIndex, setFocusedIndex] = React.useState(0);
  const [isKeyboardNavActive, setIsKeyboardNavActive] = React.useState(false);

  const parentRef = React.useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: filteredOptions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 35,
  });

  const virtualOptions = virtualizer.getVirtualItems();

  const scrollToIndex = (index: number) => {
    virtualizer.scrollToIndex(index, {
      align: "center",
    });
  };

  const handleSearch = (search: string) => {
    setIsKeyboardNavActive(false);
    setFilteredOptions(
      options.filter(
        (option) =>
          option.label.toLowerCase().includes(search.toLowerCase()) ||
          option.value.toLowerCase().includes(search.toLowerCase()),
      ),
    );
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    switch (event.key) {
      case "ArrowDown": {
        event.preventDefault();
        setIsKeyboardNavActive(true);
        setFocusedIndex((prev) => {
          const newIndex =
            prev === -1 ? 0 : Math.min(prev + 1, filteredOptions.length - 1);
          scrollToIndex(newIndex);
          return newIndex;
        });
        break;
      }
      case "ArrowUp": {
        event.preventDefault();
        setIsKeyboardNavActive(true);
        setFocusedIndex((prev) => {
          const newIndex =
            prev === -1 ? filteredOptions.length - 1 : Math.max(prev - 1, 0);
          scrollToIndex(newIndex);
          return newIndex;
        });
        break;
      }
      case "Enter": {
        event.preventDefault();
        if (filteredOptions[focusedIndex]) {
          onSelectOption?.(filteredOptions[focusedIndex].value);
        }
        break;
      }
      default:
        break;
    }
  };

  // When the component mounts or when selectedOptions changes, find the first selected
  // option and scroll to it
  React.useEffect(() => {
    if (selectedOptions.length > 0) {
      const firstSelectedOption = filteredOptions.findIndex((option) =>
        selectedOptions.includes(option.value),
      );
      if (firstSelectedOption >= 0) {
        setFocusedIndex(firstSelectedOption);
        virtualizer.scrollToIndex(firstSelectedOption, {
          align: "center",
        });
      }
    }
  }, [filteredOptions, selectedOptions, virtualizer]);

  return (
    <Command className="w-full" shouldFilter={false} onKeyDown={handleKeyDown}>
      <CommandInput onValueChange={handleSearch} placeholder={placeholder} />
      <CommandList
        ref={parentRef}
        style={{
          height: height,
          width: "100%",
          overflow: "auto",
        }}
        onMouseDown={() => setIsKeyboardNavActive(false)}
        onMouseMove={() => setIsKeyboardNavActive(false)}
      >
        <CommandEmpty>No item found.</CommandEmpty>
        <CommandGroup>
          <div
            style={{
              height: `${virtualizer.getTotalSize()}px`,
              width: "100%",
              position: "relative",
            }}
          >
            {virtualOptions.map((virtualOption) => {
              // Safely access the option with bounds checking
              const option = filteredOptions[virtualOption.index];
              if (!option) return null;

              const isSelected = selectedOptions.includes(option.value);

              return (
                <CommandItem
                  keywords={[option.label]}
                  key={option.value}
                  disabled={isKeyboardNavActive}
                  className={cn(
                    "absolute left-0 top-0 w-full bg-transparent",
                    focusedIndex === virtualOption.index &&
                      "bg-accent text-accent-foreground",
                    isKeyboardNavActive &&
                      focusedIndex !== virtualOption.index &&
                      "aria-selected:bg-transparent aria-selected:text-primary",
                  )}
                  style={{
                    height: `${virtualOption.size}px`,
                    transform: `translateY(${virtualOption.start}px)`,
                  }}
                  value={option.value}
                  onMouseEnter={() =>
                    !isKeyboardNavActive && setFocusedIndex(virtualOption.index)
                  }
                  onMouseLeave={() =>
                    !isKeyboardNavActive && setFocusedIndex(-1)
                  }
                  onSelect={onSelectOption}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      isSelected ? "opacity-100" : "opacity-0",
                    )}
                  />
                  {option.label}
                </CommandItem>
              );
            })}
          </div>
        </CommandGroup>
      </CommandList>
    </Command>
  );
};

interface VirtualizedMultiSelectProps {
  options: VirtualizedOption[];
  value?: string[];
  onChange?: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  width?: string;
  height?: string;
  triggerClassName?: string;
  disabled?: boolean;
  maxDisplayCount?: number;
}

export function VirtualizedMultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select options",
  searchPlaceholder = "Search...",
  height = "300px",
  triggerClassName,
  disabled = false,
}: VirtualizedMultiSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedOptions, setSelectedOptions] = React.useState<string[]>(
    value ?? [],
  );

  // Update internal state when external value changes
  React.useEffect(() => {
    if (value !== undefined) {
      setSelectedOptions(value);
    }
  }, [value]);

  const handleSelectOption = (optionValue: string) => {
    setSelectedOptions((current) => {
      // Toggle selection
      const newValue = current.includes(optionValue)
        ? current.filter((v) => v !== optionValue)
        : [...current, optionValue];

      // Call the onChange handler with the new selection
      onChange?.(newValue);
      return newValue;
    });
    // Don't close the popover on selection
  };

  const handleRemoveOption = (optionValue: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setSelectedOptions((current) => {
      const newValue = current.filter((v) => v !== optionValue);
      onChange?.(newValue);
      return newValue;
    });
  };

  // Get labels for selected options for display
  const selectedLabels = React.useMemo(() => {
    return selectedOptions
      .map((value) => options.find((option) => option.value === value))
      .filter((option): option is VirtualizedOption => !!option);
  }, [selectedOptions, options]);

  // Format display text for the trigger button
  const displayText = React.useMemo(() => {
    if (selectedLabels.length === 0) {
      return placeholder;
    }

    return `${selectedLabels.length} ${
      selectedLabels.length === 1 ? "item" : "items"
    } selected`;
  }, [selectedLabels, placeholder]);

  return (
    <div className="w-full">
      <Popover modal={true} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between",
              !selectedOptions.length && "text-muted-foreground",
              triggerClassName,
            )}
            disabled={disabled}
          >
            {displayText}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <VirtualizedMultiSelectCommand
            height={height}
            options={options}
            placeholder={searchPlaceholder}
            selectedOptions={selectedOptions}
            onSelectOption={handleSelectOption}
          />
        </PopoverContent>
      </Popover>

      {/* Display selected options as badges */}
      {selectedOptions.length > 0 && (
        <div className="relative mt-1 flex max-h-40 flex-wrap gap-1 overflow-y-auto border p-2">
          {selectedLabels.map((option) => (
            <Badge
              key={option.value}
              variant="secondary"
              className="flex items-center gap-1"
            >
              {option.label}
              <Button
                type="button"
                variant="ghost"
                className="h-4 w-4 p-0 hover:bg-transparent"
                onClick={(e) => handleRemoveOption(option.value, e)}
              >
                <span className="sr-only">Remove</span>
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}
    </div>
  );
}
