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
import { cn } from "~/lib/utils";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Check, ChevronsUpDown } from "lucide-react";

export type VirtualizedOption = {
  value: string;
  label: string;
};

interface VirtualizedCommandProps {
  height?: string;
  options: VirtualizedOption[];
  placeholder: string;
  selectedOption: string;
  onSelectOption?: (option: string) => void;
}

export const VirtualizedCommand = ({
  height = "400px",
  options,
  placeholder,
  selectedOption,
  onSelectOption,
}: VirtualizedCommandProps) => {
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

  // Keep filtered options in sync with incoming options
  React.useEffect(() => {
    setFilteredOptions(options);
  }, [options]);

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

  React.useEffect(() => {
    if (selectedOption) {
      const option = filteredOptions.find(
        (option) => option.value === selectedOption,
      );
      if (option) {
        const index = filteredOptions.indexOf(option);
        setFocusedIndex(index);
        virtualizer.scrollToIndex(index, {
          align: "center",
        });
      }
    }
  }, [selectedOption, filteredOptions, virtualizer]);

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
                      selectedOption === option.value
                        ? "opacity-100"
                        : "opacity-0",
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

interface VirtualizedComboboxProps {
  options: VirtualizedOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  width?: string;
  height?: string;
  triggerClassName?: string;
  disabled?: boolean;
}

export function VirtualizedCombobox({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  searchPlaceholder = "Search...",
  height = "300px",
  triggerClassName,
  disabled = false,
}: VirtualizedComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [selectedOption, setSelectedOption] = React.useState(value ?? "");

  React.useEffect(() => {
    if (value !== undefined) {
      setSelectedOption(value);
    }
  }, [value]);

  const handleSelectOption = (currentValue: string) => {
    setSelectedOption(currentValue);
    onChange?.(currentValue);
    setOpen(false);
  };

  const selectedLabel = React.useMemo(() => {
    if (!selectedOption) return null;
    const foundLabel = options.find(
      (option) => option.value === selectedOption,
    )?.label;
    // Fallback to displaying the raw value when the option label isn't available
    // This handles cases where the option list is stale or filtered differently
    return foundLabel ?? selectedOption;
  }, [selectedOption, options]);

  return (
    <div className="relative w-full">
      <Popover modal={true} open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", triggerClassName)}
            disabled={disabled}
          >
            {selectedLabel ?? placeholder}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
          <VirtualizedCommand
            height={height}
            options={options}
            placeholder={searchPlaceholder}
            selectedOption={selectedOption}
            onSelectOption={handleSelectOption}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
