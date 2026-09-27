export type Location = {
  kind: "local" | "remote";
  name?: string;
  path: string;
};

export type Remote = {
  name: string;
  type: string;
  label: string;
};

export type Entry = {
  name: string;
  path: string;
  isDir: boolean;
  size: number;
  modTime: string;
};

export type About = {
  ok: boolean;
  unsupported?: boolean;
  error?: string;
  total?: number | null;
  used?: number | null;
  free?: number | null;
};

export type TransferStats = {
  bytes: number;
  totalBytes: number;
  speed: number;
  eta: number | null;
  errors: number;
  transfers: number;
  totalTransfers: number;
  lastError: string;
  transferring: {
    name: string;
    bytes: number;
    size: number;
    percentage: number;
    speed: number;
  }[];
  recentErrors: { name: string; error: string }[];
};

export type Transfer = {
  id: string;
  jobId: number;
  mode: "copy" | "sync" | "move";
  dryRun: boolean;
  source: Location;
  dest: Location;
  sourceLabel: string;
  destLabel: string;
  file: string;
  includeExt: string[];
  minSize: string;
  maxSize: string;
  startedAt: string;
  finishedAt: string | null;
  status: "running" | "success" | "error" | "stopped" | "interrupted";
  error: string;
  stats: TransferStats | null;
};

export type TransferDraft = {
  mode: "copy" | "sync" | "move";
  dryRun: boolean;
  includeExt: string;
  minSize: string;
  maxSize: string;
};
