"use client";

import * as React from "react";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export const SUPPORTED_CURRENCIES = [
  { code: "USD", symbol: "$", name: "US Dollar" },
  { code: "EUR", symbol: "€", name: "Euro" },
  { code: "GBP", symbol: "£", name: "British Pound" },
  { code: "CAD", symbol: "CA$", name: "Canadian Dollar" },
  { code: "AUD", symbol: "A$", name: "Australian Dollar" },
  { code: "INR", symbol: "₹", name: "Indian Rupee" },
  { code: "SGD", symbol: "S$", name: "Singapore Dollar" },
  { code: "AED", symbol: "AED", name: "UAE Dirham" },
  { code: "CHF", symbol: "CHF", name: "Swiss Franc" },
  { code: "JPY", symbol: "¥", name: "Japanese Yen" },
  { code: "NZD", symbol: "NZ$", name: "New Zealand Dollar" },
  { code: "ZAR", symbol: "R", name: "South African Rand" },
  { code: "SEK", symbol: "kr", name: "Swedish Krona" },
  { code: "NOK", symbol: "kr", name: "Norwegian Krone" },
  { code: "DKK", symbol: "kr", name: "Danish Krone" },
  { code: "PLN", symbol: "zł", name: "Polish Zloty" },
  { code: "MXN", symbol: "MX$", name: "Mexican Peso" },
  { code: "BRL", symbol: "R$", name: "Brazilian Real" },
  { code: "CNY", symbol: "¥", name: "Chinese Yuan" },
  { code: "HKD", symbol: "HK$", name: "Hong Kong Dollar" },
] as const;

export interface CurrencySelectProps {
  name?: string;
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  className?: string;
}

export function CurrencySelect({
  name = "currency",
  defaultValue = "USD",
  value,
  onValueChange,
  label,
  required = false,
  disabled = false,
  className,
}: CurrencySelectProps) {
  const [internalValue, setInternalValue] = React.useState(value ?? defaultValue ?? "USD");

  const effectiveValue = value !== undefined ? value : internalValue;

  const currencyOptions = React.useMemo(() => {
    const current = effectiveValue || defaultValue;
    if (current && !SUPPORTED_CURRENCIES.some((c) => c.code === current)) {
      return [{ code: current, symbol: current, name: current }, ...SUPPORTED_CURRENCIES];
    }
    return SUPPORTED_CURRENCIES;
  }, [effectiveValue, defaultValue]);

  const itemsMap = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const c of currencyOptions) {
      map[c.code] = `${c.code} (${c.symbol}) · ${c.name}`;
    }
    return map;
  }, [currencyOptions]);

  const handleChange = (newVal: string | null) => {
    if (!newVal) return;
    setInternalValue(newVal);
    onValueChange?.(newVal);
  };

  const selectElement = (
    <Select
      items={itemsMap}
      name={name}
      value={effectiveValue}
      defaultValue={defaultValue}
      onValueChange={handleChange}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        aria-label={label || name}
        className={`w-full min-w-0 h-9 bg-background ${className || ""}`}
      >
        <SelectValue placeholder="Select currency" />
      </SelectTrigger>
      <SelectContent className="max-h-60 overflow-y-auto">
        <SelectGroup>
          <SelectLabel>Currencies</SelectLabel>
          {currencyOptions.map((curr) => (
            <SelectItem key={curr.code} value={curr.code}>
              <span className="font-semibold">{curr.code}</span>
              <span className="text-muted-foreground ml-1">({curr.symbol}) · {curr.name}</span>
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  if (label) {
    return (
      <label className="grid gap-1 text-sm">
        <span>{label}</span>
        {selectElement}
      </label>
    );
  }

  return selectElement;
}
