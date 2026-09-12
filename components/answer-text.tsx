'use client';

import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/ui/cn';

/*
 * A deliberately small Markdown subset — headings, bold, inline code, bullet
 * and numbered lists, tables, rules — covering what the analyst prompt actually
 * asks the model to produce. It builds React nodes directly and never touches
 * dangerouslySetInnerHTML, so model output cannot inject markup no matter what
 * it contains.
 *
 * Anything unrecognised falls through as plain text rather than being dropped:
 * an answer must never be silently truncated by its renderer.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\[[0-9a-f-]{8,}\]|【[^】]+】)/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).filter(Boolean).map((token, index) => {
    const key = `${keyPrefix}-${index}`;
    if (token.startsWith('**') && token.endsWith('**')) {
      return (
        <strong key={key} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    }
    if (token.startsWith('`') && token.endsWith('`')) {
      return (
        <code
          key={key}
          className="rounded-xs bg-sunken px-1 py-px font-mono text-[0.92em] text-ink-secondary"
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    // A cited result id. Shown as a compact provenance chip rather than a raw
    // UUID — it is the answer's evidence, so it should read as a reference.
    if (
      (token.startsWith('[') && token.endsWith(']')) ||
      (token.startsWith('【') && token.endsWith('】'))
    ) {
      const id = token.slice(1, -1);
      return (
        <span
          key={key}
          title={`Result ${id}`}
          className="mx-0.5 inline-flex items-center rounded-xs border border-accent-line bg-accent-soft px-1 font-mono text-[10px] text-accent align-[1px]"
        >
          {id.slice(0, 6)}
        </span>
      );
    }
    return <Fragment key={key}>{token}</Fragment>;
  });
}

function splitRow(line: string): string[] {
  return line
    .replace(/^\s*\|/, '')
    .replace(/\|\s*$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

const DELIMITER = /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/;

export function AnswerText({ text, className }: { text: string; className?: string }) {
  if (!text.trim()) return null;

  const lines = text.split('\n');
  const blocks: ReactNode[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;

  function flushList() {
    if (!list) return;
    const { ordered, items } = list;
    const Tag = ordered ? 'ol' : 'ul';
    blocks.push(
      <Tag
        key={`list-${blocks.length}`}
        className={cn(
          'my-1.5 space-y-1 pl-4 text-[13px] leading-relaxed text-ink-secondary',
          ordered ? 'list-decimal' : 'list-disc',
        )}
      >
        {items.map((item, index) => (
          <li key={index} className="marker:text-ink-faint">
            {inline(item, `li-${blocks.length}-${index}`)}
          </li>
        ))}
      </Tag>,
    );
    list = null;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (!trimmed) {
      flushList();
      continue;
    }

    // Table: a header row followed by a delimiter row.
    if (trimmed.startsWith('|') && DELIMITER.test(lines[index + 1] ?? '')) {
      flushList();
      const header = splitRow(trimmed);
      const body: string[][] = [];
      let cursor = index + 2;
      while (cursor < lines.length && lines[cursor].trim().startsWith('|')) {
        body.push(splitRow(lines[cursor].trim()));
        cursor += 1;
      }
      blocks.push(
        <div key={`table-${index}`} className="my-2 overflow-x-auto rounded-md border border-line">
          <table className="w-full border-collapse text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-sunken">
                {header.map((cell, position) => (
                  <th
                    key={position}
                    scope="col"
                    className="whitespace-nowrap px-2.5 py-1.5 text-left font-medium text-ink-secondary"
                  >
                    {inline(cell, `th-${index}-${position}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {body.map((row, rowIndex) => (
                <tr key={rowIndex} className="border-b border-line-subtle last:border-0">
                  {row.map((cell, position) => (
                    <td
                      key={position}
                      className={cn(
                        'whitespace-nowrap px-2.5 py-1.5 text-ink-secondary',
                        /^[$£€]?[\d,.\s]+%?$/.test(cell) && 'text-right tabular',
                      )}
                    >
                      {inline(cell, `td-${index}-${rowIndex}-${position}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      index = cursor - 1;
      continue;
    }

    const heading = trimmed.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushList();
      blocks.push(
        <p
          key={`h-${index}`}
          className={cn(
            'mt-3 mb-1 font-semibold tracking-tight text-ink first:mt-0',
            heading[1].length <= 2 ? 'text-[14px]' : 'text-[12.5px]',
          )}
        >
          {inline(heading[2], `h-${index}`)}
        </p>,
      );
      continue;
    }

    if (/^(---+|\*\*\*+|___+)$/.test(trimmed)) {
      flushList();
      blocks.push(<hr key={`hr-${index}`} className="my-3 border-line-subtle" />);
      continue;
    }

    const bullet = trimmed.match(/^[-*+]\s+(.*)$/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      if (!list || list.ordered !== ordered) {
        flushList();
        list = { ordered, items: [] };
      }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }

    flushList();
    blocks.push(
      <p key={`p-${index}`} className="my-1.5 text-[13px] leading-relaxed text-ink-secondary">
        {inline(trimmed, `p-${index}`)}
      </p>,
    );
  }

  flushList();

  return <div className={cn('min-w-0', className)}>{blocks}</div>;
}
