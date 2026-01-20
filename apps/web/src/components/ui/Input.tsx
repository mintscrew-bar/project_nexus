import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-sm font-medium text-text-primary mb-2">{label}</label>
        )}
        <input
          type={type}
          className={cn(
            'w-full px-4 py-2.5 bg-bg-tertiary border text-text-primary rounded-lg',
            'focus:border-accent-primary focus:outline-none transition-colors duration-150',
            'placeholder:text-text-muted',
            'disabled:opacity-50 disabled:cursor-not-allowed',
            error ? 'border-accent-danger' : 'border-text-muted',
            className
          )}
          ref={ref}
          {...props}
        />
        {error && <p className="mt-1 text-sm text-accent-danger">{error}</p>}
      </div>
    );
  }
);

Input.displayName = 'Input';
