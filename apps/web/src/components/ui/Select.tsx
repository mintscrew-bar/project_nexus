'use client';

import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import { forwardRef } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  error?: string;
  onChange?: (value: string) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ options, placeholder, label, error, className, onChange, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-text-primary text-sm font-semibold mb-1">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={cn(
              'w-full px-4 py-2.5 bg-bg-tertiary border text-text-primary rounded-lg appearance-none cursor-pointer',
              'focus:border-accent-primary focus:outline-none transition-colors duration-150',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              error ? 'border-accent-danger' : 'border-text-muted',
              className
            )}
            onChange={(e) => onChange?.(e.target.value)}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                disabled={option.disabled}
              >
                {option.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 text-text-tertiary pointer-events-none"
          />
        </div>
        {error && (
          <p className="mt-1 text-sm text-accent-danger">{error}</p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';
