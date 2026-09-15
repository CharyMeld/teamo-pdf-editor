import axios from "axios";

// The frontend is a thin client: it talks to the backend exclusively
// through this REST client. No PDF processing, storage, or business
// logic lives here — see ARCHITECTURE.md's API/service boundary rule.
const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000/api",
  withCredentials: true,
});

export default api;

export interface HealthResponse {
  status: string;
  app: string;
  time: string;
}

export async function checkHealth(): Promise<HealthResponse> {
  const { data } = await api.get<HealthResponse>("/health");
  return data;
}
