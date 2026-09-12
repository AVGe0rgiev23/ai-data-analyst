import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Mono } from 'next/font/google';
import './globals.css';

/*
 * IBM Plex, not a neutral grotesque. Plex was drawn for engineering documents:
 * its squared terminals and open counters hold up at 11px in a dense table,
 * and the Sans/Mono pair share a skeleton, so a column name in mono sits
 * beside a label in sans without looking like two products.
 */
const plexSans = IBM_Plex_Sans({
  variable: '--font-plex-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  display: 'swap',
});

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  subsets: ['latin'],
  weight: ['400', '500'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'AI Data Analyst',
  description: 'Ask questions of your data in plain English, with the SQL always shown.',
};

/**
 * Restores theme and sidebar state before first paint. Without this the page
 * renders light with an expanded sidebar, then snaps on hydration — the one
 * flash users read as "cheap". Kept tiny and dependency-free; it runs before
 * React exists, and the attributes it writes are what the components read.
 */
const BOOT_SCRIPT = `
(function () {
  var root = document.documentElement;
  try {
    var stored = localStorage.getItem('theme');
    root.setAttribute('data-theme',
      stored === 'light' || stored === 'dark' ? stored
        : (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));
    root.setAttribute('data-sidebar',
      localStorage.getItem('sidebar') === 'collapsed' ? 'collapsed' : 'expanded');
  } catch (e) {
    root.setAttribute('data-theme', 'dark');
    root.setAttribute('data-sidebar', 'expanded');
  }
})();
`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${plexSans.variable} ${plexMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT_SCRIPT }} />
      </head>
      <body className="h-full min-h-0 flex flex-col overflow-hidden">{children}</body>
    </html>
  );
}
