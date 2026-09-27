import fs from "node:fs";
import path from "node:path";

const REMOTE_NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;
const SIZE = /^(\d+(?:\.\d+)?)([kKmMgGtT])?(?:i?[bB])?$/;

export function bad(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

export function normalizeSize(input) {
  if (input == null || String(input).trim() === "") return null;
  const raw = String(input).trim().replace(",", ".").replace(/\s+/g, "");
  const match = raw.match(SIZE);
  if (!match) throw bad("Taille invalide. Exemples : 10M, 500K, 1G.");
  return `${match[1]}${match[2] ? match[2].toUpperCase() : ""}`;
}

export function normalizeExts(input) {
  if (input == null || input === "") return [];
  const list = Array.isArray(input) ? input : String(input).split(/[,\s]+/);
  const out = [];
  for (const item of list) {
    const ext = String(item).trim().replace(/^\*\./, "").replace(/^\./, "").toLowerCase();
    if (!ext) continue;
    if (!/^[a-z0-9]{1,16}$/.test(ext)) throw bad(`Extension invalide : ${item}`);
    out.push(ext);
  }
  return [...new Set(out)].slice(0, 40);
}

export function normalizeLocation(input, label) {
  if (!input || (input.kind !== "local" && input.kind !== "remote")) {
    throw bad(`${label} : emplacement invalide.`);
  }
  const rawPath = String(input.path ?? "");
  if (rawPath.includes("\0") || /[\r\n]/.test(rawPath)) {
    throw bad(`${label} : chemin invalide.`);
  }

  if (input.kind === "remote") {
    const name = String(input.name ?? "");
    if (!REMOTE_NAME.test(name)) throw bad(`${label} : nom de cloud invalide.`);
    const parts = rawPath.split("/").filter(Boolean);
    if (parts.some((part) => part === "." || part === "..")) {
      throw bad(`${label} : chemin invalide.`);
    }
    return { kind: "remote", name, path: parts.join("/") };
  }

  if (!path.isAbsolute(rawPath)) throw bad(`${label} : le chemin local doit être absolu.`);
  return { kind: "local", path: path.resolve(rawPath) };
}

export function assertKnownRemote(location, names) {
  if (location.kind === "remote" && !names.has(location.name)) {
    throw bad(`Cloud inconnu : ${location.name}`);
  }
}

export function toFs(location) {
  if (location.kind === "local") return location.path;
  return location.path ? `${location.name}:${location.path}` : `${location.name}:`;
}

export function labelOf(location) {
  return toFs(location);
}

export function normalizeFileName(input) {
  const name = String(input ?? "").trim();
  if (!name) return "";
  if (name.includes("/") || name.includes("\\") || name === "." || name === ".." || name.includes("\0")) {
    throw bad("Nom de fichier invalide.");
  }
  return name;
}

export function labelWithFile(location, file) {
  if (!file) return labelOf(location);
  if (location.kind === "local") return path.join(location.path, file);
  return location.path ? `${location.name}:${location.path}/${file}` : `${location.name}:${file}`;
}

export function assertLocalDir(location) {
  if (location.kind !== "local") return;
  let stat;
  try {
    stat = fs.statSync(location.path);
  } catch {
    throw bad(`Dossier introuvable : ${location.path}`);
  }
  if (!stat.isDirectory()) throw bad(`Pas un dossier : ${location.path}`);
}
