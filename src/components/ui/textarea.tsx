import * as React from 'react';
import { cn } from 'cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-border placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/15 disabled:bg-muted aria-invalid:border-destructive w-full min-w-0 rounded-[10px] border bg-transparent px-3 py-2.5 text-base leading-6 transition-colors outline-none focus-visible:ring-3 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-[13px]',
        className
      )}
      {...props}
    />
  );
}

export { Textarea };
