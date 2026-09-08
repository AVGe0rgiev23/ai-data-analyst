import { streamText, stepCountIs, convertToModelMessages, type UIMessage } from 'ai';
import { getSourceWithSchema } from '@/lib/db/sources';
import { buildSystemPrompt, getModel } from '@/lib/agent/prompt';
import { createTools } from '@/lib/agent/tools';
import { toFriendlyAiError } from '@/lib/ai/errors';

export const runtime = 'nodejs';
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = (await request.json()) as { sourceId?: string; messages?: UIMessage[] };
  if (!body.sourceId || !Array.isArray(body.messages)) {
    return Response.json({ error: 'sourceId and messages are required' }, { status: 400 });
  }

  const source = await getSourceWithSchema(body.sourceId);
  if (!source) return Response.json({ error: 'Unknown source' }, { status: 404 });

  const result = streamText({
    model: getModel(),
    system: buildSystemPrompt(source),
    messages: await convertToModelMessages(body.messages),
    tools: createTools(body.sourceId, source),
    stopWhen: stepCountIs(12),
  });

  return result.toUIMessageStreamResponse({
    // The response status is already sent by the time a model error happens
    // mid-stream, so a free-tier rate limit has to reach the user as stream
    // content. Without this the AI SDK masks every error as "An error occurred".
    onError: (cause) => toFriendlyAiError(cause).message,
  });
}
