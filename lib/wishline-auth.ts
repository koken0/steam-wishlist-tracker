export type WishlineUser = {
  id: string;
  email: string | null;
  name: string | null;
};

export function getWishlineUser(request: Request): WishlineUser | null {
  const id = request.headers.get('oai-authenticated-user-id')?.trim();
  if (!id) return null;

  return {
    id,
    email: cleanHeader(request.headers.get('oai-authenticated-user-email')),
    name: cleanHeader(request.headers.get('oai-authenticated-user-name')),
  };
}

function cleanHeader(value: string | null): string | null {
  const cleaned = value?.trim();
  return cleaned ? cleaned.slice(0, 254) : null;
}
