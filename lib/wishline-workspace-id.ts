export async function workspaceIdForUser(userId: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const suffix = Array.from(
    new Uint8Array(digest).slice(0, 12),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  return `ws_${suffix}`;
}
