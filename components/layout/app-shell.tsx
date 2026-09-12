'use client';

import { type ReactNode } from 'react';
import {
  Command,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Rows3,
  Table2,
  Terminal,
  Upload,
} from 'lucide-react';
import { cn } from '@/lib/ui/cn';
import { formatCount } from '@/lib/ui/format';
import { Kbd, Tooltip } from '@/components/ui/primitives';
import { setHtmlAttribute, useHtmlAttribute } from '@/lib/ui/use-dom-attribute';
import { ThemeToggle } from './theme-toggle';

export type View = 'overview' | 'analysis' | 'results' | 'sql';

export const VIEWS: { value: View; label: string; icon: typeof Table2; hint: string }[] = [
  { value: 'overview', label: 'Overview', icon: Table2, hint: 'Columns, types and coverage' },
  { value: 'analysis', label: 'Analysis', icon: MessageSquareText, hint: 'Ask a question' },
  { value: 'results', label: 'Results', icon: Rows3, hint: 'Rows from the last query' },
  { value: 'sql', label: 'SQL', icon: Terminal, hint: 'Run a query yourself' },
];

/* ── Mark ─────────────────────────────────────────────────────────────────
   Four bars at descending heights: a query result, read left to right. It is
   the only piece of pure identity in the interface, so it stays 16px and
   monochrome-plus-accent rather than becoming a logo. */

function Mark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn('shrink-0', className)}
      aria-hidden
      fill="none"
    >
      <rect x="0.5" y="6" width="3" height="9.5" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="4.75" y="2.5" width="3" height="13" rx="1" fill="currentColor" opacity="0.55" />
      <rect x="9" y="8.5" width="3" height="7" rx="1" fill="currentColor" opacity="0.35" />
      <rect x="13.25" y="0.5" width="3" height="15" rx="1" fill="var(--accent)" />
    </svg>
  );
}

/* ── Sidebar ──────────────────────────────────────────────────────────── */

function Sidebar({
  view,
  onViewChange,
  collapsed,
  onToggleCollapsed,
  disabled,
}: {
  view: View;
  onViewChange: (view: View) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  disabled: boolean;
}) {
  return (
    <nav
      aria-label="Primary"
      className={cn(
        'hidden shrink-0 flex-col border-r border-line bg-surface md:flex',
        'transition-[width] duration-200 ease-[var(--ease-out)]',
        collapsed ? 'w-[52px]' : 'w-[188px]',
      )}
    >
      <ul className="flex flex-1 flex-col gap-0.5 p-2">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          const active = item.value === view;
          const button = (
            <button
              type="button"
              disabled={disabled}
              aria-current={active ? 'page' : undefined}
              onClick={() => onViewChange(item.value)}
              className={cn(
                'group relative flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-[13px]',
                'transition-colors duration-150 disabled:pointer-events-none disabled:opacity-35',
                collapsed && 'justify-center px-0',
                active
                  ? 'bg-active font-medium text-ink'
                  : 'font-normal text-ink-secondary hover:bg-hover hover:text-ink',
              )}
            >
              {/* The active marker is a rule, not a filled pill — it reads as a
                  cursor in a list rather than a selected chip. */}
              <span
                aria-hidden
                className={cn(
                  'absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-r-full bg-accent',
                  'transition-opacity duration-150',
                  active ? 'opacity-100' : 'opacity-0',
                )}
              />
              <Icon size={15} strokeWidth={1.9} className="shrink-0" />
              {!collapsed && <span className="truncate">{item.label}</span>}
            </button>
          );

          return (
            <li key={item.value}>
              {collapsed ? (
                <Tooltip label={item.label} side="right">
                  {button}
                </Tooltip>
              ) : (
                button
              )}
            </li>
          );
        })}
      </ul>

      <div className="border-t border-line-subtle p-2">
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
          className={cn(
            'flex h-7 w-full items-center gap-2.5 rounded-md px-2 text-[12px] text-ink-muted',
            'transition-colors duration-150 hover:bg-hover hover:text-ink-secondary',
            collapsed && 'justify-center px-0',
          )}
        >
          {collapsed ? (
            <PanelLeftOpen size={14} strokeWidth={1.9} />
          ) : (
            <>
              <PanelLeftClose size={14} strokeWidth={1.9} />
              <span>Collapse</span>
            </>
          )}
        </button>
      </div>
    </nav>
  );
}

/* ── Mobile navigation ────────────────────────────────────────────────────
   A bottom bar rather than a drawer. On a phone the four views are the whole
   application, and a persistent bar costs one tap instead of two. */

function MobileNav({
  view,
  onViewChange,
  disabled,
}: {
  view: View;
  onViewChange: (view: View) => void;
  disabled: boolean;
}) {
  return (
    <nav
      aria-label="Primary"
      className="flex shrink-0 border-t border-line bg-surface md:hidden"
    >
      {VIEWS.map((item) => {
        const Icon = item.icon;
        const active = item.value === view;
        return (
          <button
            key={item.value}
            type="button"
            disabled={disabled}
            aria-current={active ? 'page' : undefined}
            onClick={() => onViewChange(item.value)}
            className={cn(
              'flex flex-1 flex-col items-center gap-1 py-2 text-[10.5px] transition-colors duration-150',
              'disabled:opacity-35',
              active ? 'text-accent' : 'text-ink-muted',
            )}
          >
            <Icon size={17} strokeWidth={1.9} />
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ── Top bar ──────────────────────────────────────────────────────────── */

function TopBar({
  datasetName,
  tableName,
  rowCount,
  columnCount,
  onChangeFile,
  onOpenCommands,
}: {
  datasetName?: string;
  tableName?: string;
  rowCount?: number;
  columnCount?: number;
  onChangeFile?: () => void;
  onOpenCommands: () => void;
}) {
  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-line bg-surface px-3">
      <div className="flex items-center gap-2">
        <Mark className="h-4 w-4 text-ink" />
        <span className="text-[13px] font-semibold tracking-tight text-ink">
          Data Analyst
        </span>
      </div>

      {datasetName && (
        <>
          <span aria-hidden className="h-3.5 w-px bg-line" />
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate text-[12.5px] font-medium text-ink" title={datasetName}>
              {datasetName}
            </span>
            {/* Dataset facts, not decoration: the two numbers the agent's
                answers are bounded by, visible at all times. */}
            <span className="hidden items-center gap-1.5 text-[11.5px] text-ink-muted sm:flex">
              <code className="rounded-xs bg-sunken px-1 py-px font-mono text-[11px] text-ink-secondary">
                {tableName}
              </code>
              <span aria-hidden>·</span>
              <span className="tabular">{formatCount(rowCount ?? 0)} rows</span>
              <span aria-hidden>·</span>
              <span className="tabular">{columnCount} cols</span>
            </span>
          </div>
        </>
      )}

      <div className="ml-auto flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenCommands}
          className={cn(
            'group hidden h-7 items-center gap-2 rounded-md border border-line bg-sunken pl-2 pr-1.5',
            'text-[12px] text-ink-muted transition-colors duration-150',
            'hover:border-line-strong hover:text-ink-secondary sm:flex',
          )}
        >
          <Command size={12} strokeWidth={2} />
          <span>Commands</span>
          <Kbd>⌘K</Kbd>
        </button>

        {onChangeFile && (
          <Tooltip label="Replace dataset" side="bottom" align="end">
            <button
              type="button"
              onClick={onChangeFile}
              aria-label="Replace dataset"
              className="flex h-7 w-7 items-center justify-center rounded-md text-ink-muted transition-colors duration-150 hover:bg-hover hover:text-ink"
            >
              <Upload size={15} strokeWidth={1.9} />
            </button>
          </Tooltip>
        )}

        <ThemeToggle />
      </div>
    </header>
  );
}

/* ── Shell ────────────────────────────────────────────────────────────── */

export function AppShell({
  view,
  onViewChange,
  datasetName,
  tableName,
  rowCount,
  columnCount,
  onChangeFile,
  onOpenCommands,
  navDisabled = false,
  children,
}: {
  view: View;
  onViewChange: (view: View) => void;
  datasetName?: string;
  tableName?: string;
  rowCount?: number;
  columnCount?: number;
  onChangeFile?: () => void;
  onOpenCommands: () => void;
  navDisabled?: boolean;
  children: ReactNode;
}) {
  // Restored onto <html> before first paint, so the sidebar never renders at
  // the wrong width and then snaps.
  const collapsed = useHtmlAttribute('data-sidebar', 'expanded') === 'collapsed';

  function toggleCollapsed() {
    setHtmlAttribute('data-sidebar', collapsed ? 'expanded' : 'collapsed', 'sidebar');
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar
        datasetName={datasetName}
        tableName={tableName}
        rowCount={rowCount}
        columnCount={columnCount}
        onChangeFile={onChangeFile}
        onOpenCommands={onOpenCommands}
      />
      <div className="flex min-h-0 flex-1">
        {!navDisabled && (
          <Sidebar
            view={view}
            onViewChange={onViewChange}
            collapsed={collapsed}
            onToggleCollapsed={toggleCollapsed}
            disabled={navDisabled}
          />
        )}
        <main className="min-w-0 flex-1 overflow-hidden bg-canvas">{children}</main>
      </div>
      {!navDisabled && (
        <MobileNav view={view} onViewChange={onViewChange} disabled={navDisabled} />
      )}
    </div>
  );
}
