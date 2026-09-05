export const schema = {
  workspaces: ['id', 'owner_user_id', 'owner_email', 'name', 'created_at', 'updated_at'],
  steamConnections: ['workspace_id', 'app_id', 'project_name', 'encrypted_api_key', 'created_at', 'updated_at'],
  wishlistDailySnapshots: ['workspace_id', 'app_id', 'report_date', 'adds', 'deletes', 'purchases', 'gifts', 'adds_windows', 'adds_mac', 'adds_linux', 'generated_at', 'fetched_at'],
  wishlistIntradaySnapshots: ['id', 'workspace_id', 'app_id', 'report_date', 'adds', 'deletes', 'purchases', 'gifts', 'generated_at', 'fetched_at'],
  wishlistAlerts: ['id', 'workspace_id', 'app_id', 'report_date', 'kind', 'title', 'message', 'created_at', 'read_at'],
} as const;
