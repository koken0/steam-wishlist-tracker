import type { WishlineUser } from './wishline-auth.ts';
import type { WishlineWorkspaceStatus } from './wishline-store-core.ts';

type ConnectionInput = { apiKey: string; appId: number; projectName?: string };

export async function validateAndSaveConnection(
  user: WishlineUser,
  input: ConnectionInput,
  dependencies: {
    validate: (input: ConnectionInput) => Promise<{ projectName: string; records: number }>;
    save: (user: WishlineUser, input: { apiKey: string; appId: number; projectName: string }) => Promise<WishlineWorkspaceStatus>;
  },
) {
  const validation = await dependencies.validate(input);
  const workspace = await dependencies.save(user, { apiKey: input.apiKey, appId: input.appId, projectName: validation.projectName });
  return { workspace, validation };
}
