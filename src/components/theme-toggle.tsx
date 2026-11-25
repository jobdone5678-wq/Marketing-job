'use client';

import { useTheme } from 'next-themes';
import { Moon, Sun } from 'lucide-react';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            aria-label="Toggle colour theme"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="text-muted-foreground hover:bg-accent hover:text-foreground flex size-8 items-center justify-center rounded-[8px] transition-colors"
          />
        }
      >
        <Sun className="size-4 stroke-[1.5] dark:hidden" />
        <Moon className="hidden size-4 stroke-[1.5] dark:block" />
      </TooltipTrigger>
      <TooltipContent>Switch light / dark</TooltipContent>
    </Tooltip>
  );
}
