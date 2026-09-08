import { describe, it, expect } from 'vitest';
import { POST } from './route';

describe('POST /api/chat', () => {
  it('rejects a request with no sourceId', async () => {
    const response = await POST(
      new Request('http://x/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ messages: [] }),
      }),
    );
    expect(response.status).toBe(400);
  });

  it('404s on an unknown source', async () => {
    const response = await POST(
      new Request('http://x/api/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceId: '00000000-0000-0000-0000-000000000000',
          messages: [],
        }),
      }),
    );
    expect(response.status).toBe(404);
  });
});
