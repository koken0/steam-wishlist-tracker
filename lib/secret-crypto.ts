import { WishlistConnectorError } from './wishlist-errors.ts';

const IV_BYTES = 12;
const ENVELOPE_VERSION = 'v1';

export async function encryptSecret(secret: string): Promise<string> {
  const keyId = currentKeyId();
  const key = await encryptionKey(process.env.WISHLIST_ENCRYPTION_KEY, 'current');
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(secret),
  );
  return `${ENVELOPE_VERSION}.${keyId}.${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(envelope: string): Promise<string> {
  const parsed = parseEnvelope(envelope);
  if (!parsed) {
    throw new WishlistConnectorError('INVALID_STORED_SECRET', 'The saved Steam connection is unreadable.', 500);
  }

  for (const candidate of candidateKeys(parsed.keyId)) {
    try {
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(parsed.iv)) },
        await encryptionKey(candidate.value, candidate.label),
        toArrayBuffer(fromBase64(parsed.ciphertext)),
      );
      return new TextDecoder().decode(plaintext);
    } catch {
      // During controlled rotation, old and new envelopes must remain readable.
    }
  }
  throw new WishlistConnectorError('INVALID_STORED_SECRET', 'The saved Steam connection could not be decrypted.', 500);
}

export function secretEnvelopeKeyId(envelope: string): string | null {
  return parseEnvelope(envelope)?.keyId ?? null;
}

export function currentSecretKeyId(): string {
  return currentKeyId();
}

async function encryptionKey(raw: string | undefined, label: string): Promise<CryptoKey> {
  const configured = raw?.trim();
  if (!configured) {
    throw new WishlistConnectorError(
      'ENCRYPTION_NOT_CONFIGURED',
      `The ${label} server encryption key is not configured.`,
      503,
    );
  }

  let material: Uint8Array;
  try {
    material = fromBase64(configured);
  } catch {
    throw new WishlistConnectorError('INVALID_ENCRYPTION_KEY', 'The server encryption key must be valid base64.', 503);
  }
  if (material.byteLength !== 32) {
    throw new WishlistConnectorError('INVALID_ENCRYPTION_KEY', 'The server encryption key must decode to exactly 32 bytes.', 503);
  }

  return crypto.subtle.importKey('raw', toArrayBuffer(material), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

function parseEnvelope(envelope: string): { keyId: string | null; iv: string; ciphertext: string } | null {
  const parts = envelope.split('.');
  if (parts.length === 2 && parts.every(Boolean)) {
    return { keyId: null, iv: parts[0], ciphertext: parts[1] };
  }
  if (parts.length === 4 && parts[0] === ENVELOPE_VERSION && validKeyId(parts[1]) && parts[2] && parts[3]) {
    return { keyId: parts[1], iv: parts[2], ciphertext: parts[3] };
  }
  return null;
}

function candidateKeys(keyId: string | null): Array<{ label: string; value: string | undefined }> {
  if (!process.env.WISHLIST_ENCRYPTION_KEY?.trim()) {
    throw new WishlistConnectorError('ENCRYPTION_NOT_CONFIGURED', 'The current server encryption key is not configured.', 503);
  }
  const currentId = currentKeyId();
  const previousValue = process.env.WISHLIST_PREVIOUS_ENCRYPTION_KEY;
  const previousId = previousValue?.trim()
    ? optionalKeyId(process.env.WISHLIST_PREVIOUS_ENCRYPTION_KEY_ID)
    : null;
  const candidates = [
    { id: currentId, label: 'current', value: process.env.WISHLIST_ENCRYPTION_KEY },
    { id: previousId, label: 'previous', value: previousValue },
  ];
  return candidates
    .filter((candidate) => candidate.value && (keyId == null || candidate.id === keyId))
    .map(({ label, value }) => ({ label, value }));
}

function currentKeyId(): string {
  return optionalKeyId(process.env.WISHLIST_ENCRYPTION_KEY_ID) || 'primary';
}

function optionalKeyId(value: string | undefined): string | null {
  const cleaned = value?.trim() || '';
  if (!cleaned) return null;
  if (!validKeyId(cleaned)) {
    throw new WishlistConnectorError('INVALID_ENCRYPTION_KEY_ID', 'Encryption key IDs must use 1-40 letters, digits, underscores, or hyphens.', 503);
  }
  return cleaned;
}

function validKeyId(value: string): boolean {
  return /^[A-Za-z0-9_-]{1,40}$/.test(value);
}

function toBase64(value: Uint8Array): string {
  let binary = '';
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toArrayBuffer(value: Uint8Array): ArrayBuffer {
  return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength) as ArrayBuffer;
}
