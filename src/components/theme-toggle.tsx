"use client";

import {useTheme} from 'next-themes';
import {Moon, Sun} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Tooltip, TooltipTrigger, TooltipContent} from '@/components/ui/tooltip';

export function ThemeToggle() {
  const {resolvedTheme,setTheme}=useTheme();
  return <Tooltip><TooltipTrigger render={<Button variant="ghost" size="icon" aria-label="Toggle color theme" onClick={()=>setTheme(resolvedTheme==='dark'?'light':'dark')}/> }><Sun className="size-4 dark:hidden"/><Moon className="hidden size-4 dark:block"/></TooltipTrigger><TooltipContent>Switch light / dark theme</TooltipContent></Tooltip>;
}
