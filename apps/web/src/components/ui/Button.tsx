import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center font-medium rounded-lg transition-colors duration-150 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-bg-primary',
  {
    variants: {
      variant: {
        primary:
          'bg-accent-primary text-white hover:bg-accent-hover active:bg-accent-active focus:ring-accent-primary',
        secondary:
          'bg-bg-tertiary text-text-primary border border-text-tertiary hover:bg-bg-elevated focus:ring-accent-primary',
        danger:
          'bg-accent-danger text-white hover:bg-red-600 active:bg-red-700 focus:ring-accent-danger',
        success:
          'bg-accent-success text-white hover:bg-green-600 active:bg-green-700 focus:ring-accent-success',
        ghost:
          'bg-transparent text-text-primary hover:bg-bg-tertiary focus:ring-accent-primary',
        gold:
          'bg-accent-gold text-bg-primary hover:bg-yellow-600 active:bg-yellow-700 focus:ring-accent-gold',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-6 py-2.5 text-base',
        lg: 'px-8 py-3 text-lg',
      },
      fullWidth: {
        true: 'w-full',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, isLoading, disabled, children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(buttonVariants({ variant, size, fullWidth, className }))}
        disabled={disabled || isLoading}
        {...props}
      >
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            처리 중...
          </>
        ) : (
          children
        )}
      </button>
    );
  }
);

Button.displayName = 'Button';
