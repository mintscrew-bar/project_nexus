import React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full px-3 py-1 text-sm font-medium',
  {
    variants: {
      variant: {
        default: 'bg-bg-tertiary text-text-primary',
        secondary: 'bg-bg-elevated text-text-secondary',
        primary: 'bg-accent-primary/20 text-accent-primary',
        success: 'bg-accent-success/20 text-accent-success',
        danger: 'bg-accent-danger/20 text-accent-danger',
        warning: 'bg-accent-warning/20 text-accent-warning',
        gold: 'bg-accent-gold/20 text-accent-gold',
        // Tier badges
        iron: 'bg-tier-iron/20 text-tier-iron',
        bronze: 'bg-tier-bronze/20 text-tier-bronze',
        silver: 'bg-tier-silver/20 text-tier-silver',
        'tier-gold': 'bg-tier-gold/20 text-tier-gold',
        platinum: 'bg-tier-platinum/20 text-tier-platinum',
        emerald: 'bg-tier-emerald/20 text-tier-emerald',
        diamond: 'bg-tier-diamond/20 text-tier-diamond',
        master: 'bg-tier-master/20 text-tier-master',
        grandmaster: 'bg-tier-grandmaster/20 text-tier-grandmaster',
        challenger: 'bg-tier-challenger/20 text-tier-challenger',
      },
      size: {
        sm: 'text-xs px-2 py-0.5',
        md: 'text-sm px-3 py-1',
        lg: 'text-base px-4 py-1.5',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'md',
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <span ref={ref} className={cn(badgeVariants({ variant, size }), className)} {...props} />
    );
  }
);

Badge.displayName = 'Badge';
