import type React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { LucideIcon } from 'lucide-react';
import { Button } from './Button';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  /** 링크를 섞을 수 있도록 ReactNode 허용 */
  description?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
  /** 보조 CTA — 데이터가 없을 때 다음 행동을 하나 더 제시한다(가이드, 외부 링크 등) */
  secondaryAction?: {
    label: string;
    href?: string;
    onClick?: () => void;
    external?: boolean;
  };
  className?: string;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-12 px-4 text-center',
        className
      )}
    >
      {Icon && (
        <div className="mb-4 p-4 bg-bg-tertiary rounded-full">
          <Icon className="h-8 w-8 text-text-tertiary" />
        </div>
      )}
      <h3 className="text-lg font-semibold text-text-primary mb-2">{title}</h3>
      {description && (
        <p className="text-text-secondary text-sm max-w-sm mb-6">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          {action && (
            <Button variant="primary" onClick={action.onClick}>
              {action.label}
            </Button>
          )}
          {secondaryAction &&
            (secondaryAction.href ? (
              secondaryAction.external ? (
                <a
                  href={secondaryAction.href}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <Button variant="secondary">{secondaryAction.label}</Button>
                </a>
              ) : (
                <Link href={secondaryAction.href}>
                  <Button variant="secondary">{secondaryAction.label}</Button>
                </Link>
              )
            ) : (
              <Button variant="secondary" onClick={secondaryAction.onClick}>
                {secondaryAction.label}
              </Button>
            ))}
        </div>
      )}
    </div>
  );
}
