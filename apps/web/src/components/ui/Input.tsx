import React from 'react';
import { cn } from '@/lib/utils';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, label, error, id, ...props }, ref) => {
    // label과 input을 htmlFor/id로 연결해야 스크린리더가 이름을 읽는다.
    const generatedId = React.useId();
    const inputId = id ?? generatedId;
    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-text-primary mb-2"
          >
            {label}
          </label>
        )}
        <input
          id={inputId}
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
