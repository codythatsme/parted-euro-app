import * as React from "react";
import { Check, ChevronsUpDown, Tag, X } from "lucide-react";
import { cn } from "~/lib/utils";
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
import { Switch } from "~/components/ui/switch";
import { Label } from "~/components/ui/label";
import { useVirtualizer } from "@tanstack/react-virtual";

export interface InventoryOption {
  value: string;
  label: string;
  isAssigned?: boolean;
}

interface FilterableInventorySelectProps {
  options: InventoryOption[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  height?: string;
  disabled?: boolean;
  triggerClassName?: string;
}

export function FilterableInventorySelect({
  options,
  value,
  onChange,
  placeholder = "Select inventory...",
  searchPlaceholder = "Search inventory...",
  height = "300px",
  disabled = false,
  triggerClassName,
}: FilterableInventorySelectProps) {
  const [open, setOpen] = React.useState(false);
  const [searchQuery, setSearchQuery] = React.useState("");
  const [showOnlyUnassigned, setShowOnlyUnassigned] = React.useState(true);

  // Filter options based on search query and assignment filter
  const filteredOptions = React.useMemo(() => {
    return options.filter((option) => {
      const matchesSearch =
        searchQuery === "" ||
        option.label.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesFilter = !showOnlyUnassigned || !option.isAssigned;

      return matchesSearch && matchesFilter;
    });
  }, [options, searchQuery, showOnlyUnassigned]);

  // Format display of selected values
  const displayValue = React.useMemo(() => {
    if (value.length === 0) return "";
    if (value.length === 1) {
      const selectedOption = options.find((o) => o.value === value[0]);
      return selectedOption?.label ?? "";
    }
    return `${value.length} items selected`;
  }, [value, options]);

  // Toggle item selection
  const toggleItem = (itemValue: string) => {
    if (value.includes(itemValue)) {
      onChange(value.filter((v) => v !== itemValue));
    } else {
      onChange([...value, itemValue]);
    }
  };

  // Set up virtualization
  const parentRef = React.useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: filteredOptions.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 45, // Increased from 35 to 45 for more space
  });

  const virtualOptions = virtualizer.getVirtualItems();

  // Reset virtualizer when opening the popover or when filtered options change
  React.useEffect(() => {
    if (open) {
      // Use a small timeout to ensure the DOM is ready
      const timer = setTimeout(() => {
        virtualizer.measure();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, virtualizer, filteredOptions.length]);

  const handleRemoveOption = (optionValue: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    onChange(value.filter((v) => v !== optionValue));
  };

  // Get labels for selected options to display
  const selectedLabels = React.useMemo(() => {
    return value
      .map((val) => options.find((option) => option.value === val))
      .filter((option): option is InventoryOption => !!option);
  }, [value, options]);

  const handleOpenChange = (newOpen: boolean) => {
    setOpen(newOpen);
    // Reset search and scrolling when opening
    if (newOpen) {
      setSearchQuery("");
      if (parentRef.current) {
        parentRef.current.scrollTop = 0;
      }
    }
  };

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={handleOpenChange} modal={true}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn("w-full justify-between", triggerClassName)}
            disabled={disabled}
          >
            <span className="truncate">{displayValue || placeholder}</span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="w-[var(--radix-popover-trigger-width)] p-0"
          align="start"
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={searchPlaceholder}
              value={searchQuery}
              onValueChange={setSearchQuery}
              className="h-10"
            />
            <div className="border-b bg-muted/30 px-3 py-2">
              <div className="flex items-center space-x-2">
                <Switch
                  id="show-unassigned"
                  checked={showOnlyUnassigned}
                  onCheckedChange={setShowOnlyUnassigned}
                />
                <Label htmlFor="show-unassigned">Show only unassigned</Label>
              </div>
            </div>
            <CommandList
              style={{ height }}
              ref={parentRef}
              className="scrollbar-thin"
              // Add a key to force re-render when the popover opens
              key={open ? "open" : "closed"}
            >
              {filteredOptions.length === 0 && (
                <CommandEmpty>No items match your search</CommandEmpty>
              )}
              <CommandGroup>
                <div
                  style={{
                    height: `${virtualizer.getTotalSize()}px`,
                    width: "100%",
                    position: "relative",
                  }}
                >
                  {virtualOptions.map((virtualOption) => {
                    const option = filteredOptions[virtualOption.index];
                    if (!option) return null;

                    const isSelected = value.includes(option.value);

                    return (
                      <CommandItem
                        key={option.value}
                        value={option.value}
                        onSelect={() => toggleItem(option.value)}
                        className="absolute left-0 top-0 w-full p-2"
                        style={{
                          height: `${virtualOption.size}px`,
                          transform: `translateY(${virtualOption.start}px)`,
                        }}
                      >
                        <div className="flex w-full items-center justify-between">
                          <div className="flex max-w-[75%] items-center">
                            <Check
                              className={cn(
                                "mr-2 h-4 w-4 flex-shrink-0",
                                isSelected ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="truncate">{option.label}</span>
                          </div>
                          {option.isAssigned && (
                            <Badge
                              variant="outline"
                              className="ml-2 flex-shrink-0 border-amber-200 bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700"
                            >
                              <Tag className="mr-1 h-3 w-3" />
                              Listed
                            </Badge>
                          )}
                        </div>
                      </CommandItem>
                    );
                  })}
                </div>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {/* Display selected options as badges */}
      {value.length > 0 && (
        <div className="relative mt-1 flex max-h-40 flex-wrap gap-1.5 overflow-y-auto rounded border p-2">
          {selectedLabels.map((option) => (
            <Badge
              key={option.value}
              variant="secondary"
              className="flex items-center gap-1 py-1.5 pr-1"
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
