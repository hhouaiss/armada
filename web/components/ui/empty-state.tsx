import * as React from 'react';
import { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  ...props
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        'flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-white/10 bg-black/20 p-8 text-center',
        className
      )}
      {...props}
    >
      {Icon && (
        <div className="mb-4 rounded-full bg-white/5 p-4">
          <Icon className="h-8 w-8 text-gray-400" />
        </div>
      )}
      <h3 className="mb-2 text-lg font-semibold text-gray-100">{title}</h3>
      {description && (
        <p className="mb-6 max-w-sm text-sm text-gray-400">{description}</p>
      )}
      {action && (
        <Button
          onClick={action.onClick}
          className="bg-primary hover:bg-primary/90"
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

export { EmptyState };
