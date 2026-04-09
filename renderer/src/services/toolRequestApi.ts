import { apiClient } from "./apiClient";

export type ToolRequestPayload = {
  tool_name: string;
  tool_type: string;
  purpose: string;
  website_url: string;
  screenshot_note: string;
  capability: string;
};

export type ToolRequestRow = ToolRequestPayload & {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
};

export async function createToolRequest(body: ToolRequestPayload): Promise<{ id: string; status: string }> {
  const { data } = await apiClient.post<{ id: string; status: string; created_at?: string }>(
    "/aics/tool-requests",
    body
  );
  return { id: data.id, status: data.status };
}

export async function listToolRequests(): Promise<ToolRequestRow[]> {
  const { data } = await apiClient.get<{ items: ToolRequestRow[] }>("/aics/tool-requests");
  return data.items ?? [];
}
