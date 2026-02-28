import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { format } from "date-fns";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format a date with default format or specified format
 */
export function formatDate(
  date: Date | string | number,
  formatStr = "PPP",
) {
  if (!date) return "";

  // If date is a string, convert it to a Date object
  const dateObj = typeof date === "string" ? new Date(date) : date;

  return format(dateObj, formatStr);
}

/**
 * Format a number as currency (USD by default)
 */
export function formatCurrency(
  amount: number,
  options: Intl.NumberFormatOptions = {},
  locale = "en-US",
) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    ...options,
  }).format(amount);
}
