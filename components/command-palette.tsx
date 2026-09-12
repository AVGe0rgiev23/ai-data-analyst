'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Search } from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { Kbd } from '@/components/ui/primitives';

export type CommandItem = {
  id: string;
  label: string;
  group: string;
  icon?: React.ReactNode;
  hint?: string;
  keywords?: string;
  disabled?: boolean;
  run: () => void;
};

/**
 * Built on the native <dialog> element, which supplies the focus trap, the
 * inert background and Escape-to-close that a div-based modal has to
 * reimplement — usually incompletely.
 */
export function CommandPalette({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: CommandItem[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [query, setQuery] = useState('');
  const [rawIndex, setIndex] = useState(0);

  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const usable = items.filter((item) => !item.disabled);
    if (!needle) return usable;
    return usable.filter((item) =>
      `${item.label} ${item.group} ${item.keywords ?? ''}`.toLowerCase().includes(needle),
    );
  }, [items, query]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      setQuery('');
      setIndex(0);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  // Clamped during render rather than corrected in an effect: filtering can
  // shrink the list below the cursor, and re-rendering once with an
  // out-of-range highlight is a visible flicker.
  const index = Math.min(rawIndex, Math.max(0, matches.length - 1));

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${index}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [index]);

  function choose(item: CommandItem | undefined) {
    if (!item) return;
    onClose();
    item.run();
  }

  const grouped = matches.reduce<Record<string, CommandItem[]>>((all, item) => {
    (all[item.group] ??= []).push(item);
    return all;
  }, {});

  let flat = -1;

  return (
    <dialog
      ref={dialogRef}
      aria-label="Command palette"
      onClose={onClose}
      onClick={(event) => {
        // The backdrop is part of the dialog's own box, so a click landing
        // outside the inner panel means the backdrop was hit.
        if (event.target === dialogRef.current) onClose();
      }}
      className={cn(
        'm-0 w-full max-w-lg rounded-xl border border-line bg-elevated p-0 text-ink shadow-lg',
        'fixed left-1/2 top-[12vh] -translate-x-1/2',
        'backdrop:bg-black/45 backdrop:backdrop-blur-[2px]',
        'open:animate-pop',
      )}
    >
      <div className="flex items-center gap-2 border-b border-line-subtle px-3">
        <Search size={15} strokeWidth={1.9} className="shrink-0 text-ink-faint" />
        <input
          autoFocus
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search commands…"
          aria-label="Search commands"
          aria-activedescendant={matches[index] ? `command-${matches[index].id}` : undefined}
          className="h-11 w-full bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-faint"
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              setIndex((current) => (current + 1) % Math.max(1, matches.length));
            } else if (event.key === 'ArrowUp') {
              event.preventDefault();
              setIndex(
                (current) => (current - 1 + matches.length) % Math.max(1, matches.length),
              );
            } else if (event.key === 'Enter') {
              event.preventDefault();
              choose(matches[index]);
            }
          }}
        />
        <Kbd>Esc</Kbd>
      </div>

      <ul ref={listRef} role="listbox" aria-label="Commands" className="max-h-72 overflow-y-auto p-1.5">
        {matches.length === 0 && (
          <li className="px-2.5 py-6 text-center text-[12.5px] text-ink-muted">
            No command matches “{query}”.
          </li>
        )}
        {Object.entries(grouped).map(([group, groupItems]) => (
          <li key={group}>
            <p className="px-2.5 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-[0.07em] text-ink-faint">
              {group}
            </p>
            <ul>
              {groupItems.map((item) => {
                flat += 1;
                const position = flat;
                const active = position === index;
                return (
                  <li key={item.id}>
                    <button
                      type="button"
                      id={`command-${item.id}`}
                      role="option"
                      aria-selected={active}
                      data-index={position}
                      onMouseMove={() => setIndex(position)}
                      onClick={() => choose(item)}
                      className={cn(
                        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-left text-[13px]',
                        'transition-colors duration-100',
                        active ? 'bg-accent-soft text-ink' : 'text-ink-secondary',
                      )}
                    >
                      {item.icon && (
                        <span className={cn('shrink-0', active ? 'text-accent' : 'text-ink-faint')}>
                          {item.icon}
                        </span>
                      )}
                      <span className="truncate">{item.label}</span>
                      {item.hint && (
                        <span className="ml-auto shrink-0 truncate text-[11px] text-ink-faint">
                          {item.hint}
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ul>
    </dialog>
  );
}

/** Binds ⌘K / Ctrl-K, ignoring the shortcut while the user is typing. */
export function useCommandShortcut(onOpen: () => void) {
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      onOpen();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onOpen]);
}
