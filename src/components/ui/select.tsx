"use client";

import * as React from "react";
import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

type SelectOption = {
  value: string;
  label: React.ReactNode;
  disabled?: boolean;
};

function collectOptions(children: React.ReactNode): SelectOption[] {
  const options: SelectOption[] = [];
  React.Children.forEach(children, (child) => {
    if (!React.isValidElement(child)) return;
    if (child.type !== "option") return;
    const props = child.props as {
      value?: string | number;
      children?: React.ReactNode;
      disabled?: boolean;
    };
    options.push({
      value: String(props.value ?? ""),
      label: props.children,
      disabled: props.disabled,
    });
  });
  return options;
}

type SelectProps = Omit<
  React.SelectHTMLAttributes<HTMLSelectElement>,
  "onChange" | "value" | "defaultValue" | "size"
> & {
  value?: string;
  defaultValue?: string;
  onChange?: (event: { target: { value: string } }) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  children?: React.ReactNode;
};

export const Select = React.forwardRef<HTMLButtonElement, SelectProps>(
  (
    {
      value,
      defaultValue,
      onChange,
      onValueChange,
      placeholder = "Select…",
      className,
      children,
      disabled,
      id,
      name,
      "aria-label": ariaLabel,
    },
    ref
  ) => {
    const options = React.useMemo(() => collectOptions(children), [children]);

    function handleValueChange(next: string) {
      onValueChange?.(next);
      onChange?.({ target: { value: next } });
    }

    return (
      <SelectPrimitive.Root
        value={value}
        defaultValue={defaultValue}
        onValueChange={handleValueChange}
        disabled={disabled}
        name={name}
      >
        <SelectPrimitive.Trigger
          ref={ref}
          id={id}
          aria-label={ariaLabel}
          className={cn(
            "inline-flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface-solid)] px-3 text-left text-sm text-[var(--foreground)] shadow-sm transition-colors",
            "hover:bg-[var(--muted)]",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]",
            "disabled:cursor-not-allowed disabled:opacity-55",
            "data-[placeholder]:text-[var(--muted-foreground)]",
            className
          )}
        >
          <SelectPrimitive.Value placeholder={placeholder} />
          <SelectPrimitive.Icon asChild>
            <ChevronDown className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]" />
          </SelectPrimitive.Icon>
        </SelectPrimitive.Trigger>

        <SelectPrimitive.Portal>
          <SelectPrimitive.Content
            position="popper"
            sideOffset={6}
            className={cn(
              "z-[60] max-h-64 min-w-[var(--radix-select-trigger-width)] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface-solid)] p-1 shadow-[var(--shadow-hover)]"
            )}
          >
            <SelectPrimitive.Viewport className="p-0.5">
              {options.map((opt) => (
                <SelectPrimitive.Item
                  key={opt.value}
                  value={opt.value}
                  disabled={opt.disabled}
                  className={cn(
                    "relative flex cursor-pointer select-none items-center rounded-lg py-2 pl-8 pr-3 text-sm text-[var(--foreground)] outline-none",
                    "data-[highlighted]:bg-[var(--accent)] data-[highlighted]:text-[var(--accent-foreground)]",
                    "data-[disabled]:pointer-events-none data-[disabled]:opacity-40"
                  )}
                >
                  <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
                    <SelectPrimitive.ItemIndicator>
                      <Check className="h-3.5 w-3.5" />
                    </SelectPrimitive.ItemIndicator>
                  </span>
                  <SelectPrimitive.ItemText>{opt.label}</SelectPrimitive.ItemText>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.Viewport>
          </SelectPrimitive.Content>
        </SelectPrimitive.Portal>
      </SelectPrimitive.Root>
    );
  }
);
Select.displayName = "Select";
