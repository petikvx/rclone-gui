import type { Location } from "./types";

const TINTS: Record<string, string> = {
  drive: "#6e8f6a",
  dropbox: "#6a84ad",
  mega: "#b15d5d",
  s3: "#c4894e",
  b2: "#c46b4e",
  pcloud: "#5c94ab",
  fichier: "#a39462",
  sftp: "#8a8a84",
  onedrive: "#5d7ea8",
  crypt: "#8d7aa3",
  local: "#b7a37a",
};

export function tintFor(type: string) {
  return TINTS[type] || "#8d8778";
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  const digits = size >= 10 || index === 0 ? 0 : 1;
  return `${size.toLocaleString("fr-FR", { maximumFractionDigits: digits })} ${units[index]}`;
}

export function formatEta(seconds: number | null | undefined) {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0 || seconds > 60 * 60 * 24 * 30) return "—";
  const total = Math.round(seconds);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function locationLabel(location: Location) {
  if (location.kind === "local") return location.path || "Local";
  return location.path ? `${location.name}:${location.path}` : `${location.name}:`;
}

export function modeLabel(mode: "copy" | "sync" | "move") {
  if (mode === "sync") return "Synchroniser";
  if (mode === "move") return "Déplacer";
  return "Copier";
}

export function statusLabel(status: string) {
  switch (status) {
    case "running":
      return "En cours";
    case "success":
      return "Terminé";
    case "error":
      return "Erreur";
    case "stopped":
      return "Arrêté";
    case "interrupted":
      return "Interrompu";
    default:
      return status;
  }
}
