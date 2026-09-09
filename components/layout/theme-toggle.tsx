'use client';

import { Moon, Sun } from 'lucide-react';
import { Tooltip } from '@/components/ui/primitives';
import { setHtmlAttribute, useHtmlAttribute } from '@/lib/ui/use-dom-attribute';

/**
 * The pre-paint script in layout.tsx already resolved the mode onto <html>.
 * This reads that attribute rather than deciding again, so there is exactly one
 * source of truth and no first-render flash.
 */
export function ThemeToggle() {
  const mode = useHtmlAttribute('data-theme', 'dark');
  const light = mode === 'light';
  const label = light ? 'Switch to dark theme' : 'Switch to light theme';

  return (
    <Tooltip label={label} side="bottom" align="end">
      <button
        type="button"
        onClick={() => setHtmlAttribute('data-theme', light ? 'dark' : 'light', 'theme')}
        aria-label={label}
        className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
      >
        {light ? <Moon size={15} strokeWidth={1.9} /> : <Sun size={15} strokeWidth={1.9} />}
      </button>
    </Tooltip>
  );
}
