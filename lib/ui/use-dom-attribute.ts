'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * Reads an attribute on <html> as React state.
 *
 * Both the theme and the sidebar are written to the document element by the
 * pre-paint script in layout.tsx, before React exists, so that the first
 * painted frame is already correct. That makes the DOM the source of truth,
 * not a copy of component state — and the honest way to consume an external
 * source of truth is useSyncExternalStore rather than mirroring it into
 * useState from an effect, which renders once with the wrong value and then
 * re-renders.
 */
export function useHtmlAttribute(name: string, serverValue: string): string {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const observer = new MutationObserver(onChange);
      observer.observe(document.documentElement, {
        attributes: true,
        attributeFilter: [name],
      });
      return () => observer.disconnect();
    },
    [name],
  );

  const getSnapshot = useCallback(
    () => document.documentElement.getAttribute(name) ?? serverValue,
    [name, serverValue],
  );

  return useSyncExternalStore(subscribe, getSnapshot, () => serverValue);
}

/** Writes the attribute and remembers it, so the pre-paint script can restore it. */
export function setHtmlAttribute(name: string, value: string, storageKey?: string): void {
  document.documentElement.setAttribute(name, value);
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, value);
  } catch {
    // Private mode or storage disabled. The change still applies to this
    // session; only the memory of it is lost.
  }
}
