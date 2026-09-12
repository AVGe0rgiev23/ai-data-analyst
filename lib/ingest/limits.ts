import { formatBytes } from '@/lib/ui/format';

/**
 * The one home for the upload limit. The route enforces it and the dropzone
 * states it; when each kept its own copy, the dropzone promised "a few hundred
 * MB" while the route refused anything over 100.
 */
export const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

export const UPLOAD_TOO_LARGE = `File exceeds the ${formatBytes(MAX_UPLOAD_BYTES)} limit.`;
