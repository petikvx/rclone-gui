import type { About, Entry, Location, Remote, Transfer } from "./types";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `Erreur ${response.status}`);
  }
  return data as T;
}

export const api = {
  health: () => request<{ ok: boolean; version: string }>("/api/health"),
  home: () => request<{ path: string }>("/api/home"),
  remotes: () => request<{ remotes: Remote[] }>("/api/remotes"),
  about: (name: string) => request<About>(`/api/about?name=${encodeURIComponent(name)}`),
  list: (location: Location) => request<{ entries: Entry[] }>("/api/list", { method: "POST", body: JSON.stringify({ location }) }),
  mkdir: (location: Location, name: string) =>
    request<{ ok: boolean }>("/api/mkdir", { method: "POST", body: JSON.stringify({ location, name }) }),
  transfers: () => request<{ transfers: Transfer[] }>("/api/transfers"),
  startTransfer: (body: {
    mode: "copy" | "sync" | "move";
    dryRun: boolean;
    source: Location;
    dest: Location;
    file?: string;
    includeExt: string;
    minSize: string;
    maxSize: string;
  }) => request<{ transfer: Transfer }>("/api/transfers", { method: "POST", body: JSON.stringify(body) }),
  stopTransfer: (id: string) =>
    request<{ transfer: Transfer }>(`/api/transfers/${encodeURIComponent(id)}/stop`, { method: "POST" }),
};
