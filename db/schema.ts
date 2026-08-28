export const schema = {
  workspaces: ['id', 'owner_user_id', 'owner_email', 'name', 'created_at', 'updated_at'],
  steamConnections: ['workspace_id', 'app_id', 'project_name', 'encrypted_api_key', 'created_at', 'updated_at'],
} as const;
