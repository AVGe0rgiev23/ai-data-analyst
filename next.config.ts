import type { NextConfig } from 'next';

/**
 * The DuckDB platform package ships `duckdb.node` next to a shared library
 * (`libduckdb.so` on Linux, `duckdb.dll` on Windows). Next traces the `.node`
 * addon but not that sibling, so the deployed function loaded the addon and
 * then died with "libduckdb.so: cannot open shared object file".
 *
 * The path is pnpm's real store layout, not `node_modules/@duckdb/...`: under
 * pnpm only `node-api` is linked there, so a glob pointing at
 * `node_modules/@duckdb/node-bindings*` matches nothing and the Vercel build
 * fails with ENOENT while packaging outputs. This pattern matches on both
 * Linux (CI) and Windows (local), which is what keeps it from doing that.
 */
const DUCKDB_NATIVE = ['./node_modules/.pnpm/@duckdb+node-bindings-*/node_modules/@duckdb/**/*'];

const nextConfig: NextConfig = {
  serverExternalPackages: ['@duckdb/node-api', '@duckdb/node-bindings'],
  // Scoped per route rather than '/api/**/*': the native payload is ~40 MB and
  // a wildcard copies it into every API function, including the ones that only
  // read Postgres. These are the routes that open a DuckDB session.
  outputFileTracingIncludes: {
    '/api/sources': DUCKDB_NATIVE,
    '/api/query': DUCKDB_NATIVE,
    '/api/chat': DUCKDB_NATIVE,
    '/api/duckdb-smoke': DUCKDB_NATIVE,
  },
};

export default nextConfig;
