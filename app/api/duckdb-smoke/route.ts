import { duckdbVersion } from '@/lib/duckdb/smoke';

export const runtime = 'nodejs';
export const maxDuration = 30;

export async function GET() {
  return Response.json({ version: await duckdbVersion() });
}
