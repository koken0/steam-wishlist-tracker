import { WishlistConnectorError } from './wishlist-errors.ts';

const IV_BYTES = 12;

export async function encryptSecret(secret: string): Promise<string> {
  const key = await encryptionKey();
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    new TextEncoder().encode(secret),
  );
  return `${toBase64(iv)}.${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptSecret(envelope: string): Promise<string> {
  const [ivValue, ciphertextValue, extra] = envelope.split('.');
  if (!ivValue || !ciphertextValue || extra) {
    throw new WishlistConnectorError('INVALID_STORED_SECRET', 'The saved Steam connection is unreadable.', 500);
  }

  try {
    const plaintext = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: toArrayBuffer(fromBase64(ivValue)) },
      await encryptionKey(),
      toArrayBuffer(fromBase64(ciphertextValue)),
    );
    return new TextDecoder().decode(plaintext);
  } catch {
    throw new WishlistConnectorError('INVALID_STORED_SECRET', 'The saved Steam connection could not be decrypted.', 500);
  }
}

async function encryptionKey(): Promise<CryptoKey> {
  const configured = process.env.WISHLIST_ENCRYPTION_KEY?.trim();
  if (!configured) {
    throw new WishlistConnectorError(
      'ENCRYPTION_NOT_CONFIGURED',
      'The server encryption key is not configured. Restart Wishline after configuring WISHLIST_ENCRYPTION_KEY.',
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
