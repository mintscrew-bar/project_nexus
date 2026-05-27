import { ChevronRight } from 'lucide-react';
import { GUIDE_TOC } from '@/lib/guide-toc';

export function GuideSidebarContent() {
  return (
    <div>
      <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3 px-2">
        기능 가이드
      </h2>
      <nav aria-label="가이드 목차" className="space-y-1">
        {GUIDE_TOC.map((item) => (
          <a
            key={item.id}
            href={`#${item.id}`}
            className="group flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-text-secondary hover:text-accent-primary hover:bg-accent-primary/10 transition-colors"
          >
            <ChevronRight className="h-4 w-4 flex-shrink-0 text-text-tertiary group-hover:text-accent-primary" />
            <span className="font-medium">{item.label}</span>
          </a>
        ))}
      </nav>
    </div>
  );
}
