import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import {
  assertKnownRemote,
  assertLocalDir,
  bad,
  labelWithFile,
  normalizeExts,
  normalizeFileName,
  normalizeLocation,
  normalizeSize,
  toFs,
} from "./locations.js";
import { configDir, providerLabel, startRclone } from "./rclone.js";

const PORT = Number(process.env.PORT || 8787);
const HISTORY_PATH = path.join(configDir(), "history.json");
const MODES = new Set(["copy", "sync", "move"]);

let rclone = null;
let starting = null;
const aboutCache = new Map();
let transfers = loadHistory();

function loadHistory() {
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf8"));
    const list = Array.isArray(parsed.transfers) ? parsed.transfers : [];
    return list.map((item) => {
      if (item.status === "running") {
        return {
          ...item,
          status: "interrupted",
          finishedAt: item.finishedAt || new Date().toISOString(),
          error: "Le serveur a été arrêté pendant le transfert.",
        };
      }
      return item;
    });
  } catch {
    return [];
  }
}

function saveHistory() {
  const file = `${HISTORY_PATH}.tmp`;
  fs.writeFileSync(file, JSON.stringify({ transfers }, null, 2), { mode: 0o600 });
  fs.renameSync(file, HISTORY_PATH);
}

async function engine() {
  if (rclone && rclone.child.exitCode === null && rclone.child.signalCode === null) return rclone;
  if (!starting) {
    starting = startRclone()
      .then((handle) => {
        rclone = handle;
        handle.child.once("exit", () => {
          if (rclone === handle) rclone = null;
        });
        return handle;
      })
      .finally(() => {
        starting = null;
      });
  }
  return starting;
}

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) {
        reject(bad("Requête trop volumineuse."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      if (!chunks.length) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")));
      } catch {
        reject(bad("JSON invalide."));
      }
    });
    req.on("error", reject);
  });
}

async function remoteNames(rc) {
  const listed = await rc.call("config/listremotes", {}, 10000);
  return new Set(
    (listed.remotes || []).map((name) => String(name).replace(/:$/, "")).filter(Boolean),
  );
}

async function remoteCatalog(rc) {
  const names = await remoteNames(rc);
  const dump = await rc.call("config/dump", {}, 10000);
  const remotes = [...names].map((name) => {
    const type = typeof dump?.[name]?.type === "string" ? dump[name].type : "inconnu";
    return { name, type, label: providerLabel(type) };
  });
  remotes.sort((a, b) => a.label.localeCompare(b.label, "fr") || a.name.localeCompare(b.name, "fr"));
  return { names, remotes };
}

function buildFilter(body) {
  const exts = normalizeExts(body.includeExt);
  const minSize = normalizeSize(body.minSize);
  const maxSize = normalizeSize(body.maxSize);
  const filter = {};
  if (exts.length) {
    filter.IncludeRule = exts.map((ext) => `*.${ext}`);
    filter.IgnoreCase = true;
  }
  if (minSize) filter.MinSize = minSize;
  if (maxSize) filter.MaxSize = maxSize;
  return Object.keys(filter).length ? filter : null;
}

function slimStats(stats, transferred) {
  if (!stats) return null;
  const recentErrors = (transferred || [])
    .filter((item) => item && item.error)
    .slice(-8)
    .map((item) => ({ name: item.name, error: String(item.error).slice(0, 300) }));
  return {
    bytes: stats.bytes || 0,
    totalBytes: stats.totalBytes || 0,
    speed: stats.speed || 0,
    eta: stats.eta ?? null,
    errors: stats.errors || 0,
    transfers: stats.transfers || 0,
    totalTransfers: stats.totalTransfers || 0,
    lastError: stats.lastError ? String(stats.lastError).slice(0, 300) : "",
    transferring: (stats.transferring || []).slice(0, 12).map((item) => ({
      name: item.name,
      bytes: item.bytes || 0,
      size: item.size || 0,
      percentage: item.percentage || 0,
      speed: item.speed || 0,
    })),
    recentErrors,
  };
}

async function refreshTransfer(rc, record) {
  if (record.status !== "running") return;
  try {
    const status = await rc.call("job/status", { jobid: record.jobId }, 10000);
    if (status.group) record.group = status.group;
    try {
      const stats = await rc.call("core/stats", { group: record.group }, 10000);
      let transferred = [];
      try {
        const done = await rc.call("core/transferred", { group: record.group }, 10000);
        transferred = done.transferred || [];
      } catch {
        transferred = [];
      }
      const snapshot = slimStats(stats, transferred);
      const hasSignal = snapshot.bytes || snapshot.totalBytes || snapshot.transfers || snapshot.errors || snapshot.transferring.length;
      if (!status.finished || hasSignal || !record.stats) record.stats = snapshot;
    } catch {
      // Les stats de groupe peuvent disparaître juste à la fin du job.
    }
    record.pollFails = 0;
    if (status.finished) {
      record.finishedAt = new Date().toISOString();
      record.error = status.error ? String(status.error).slice(0, 500) : "";
      if (status.success) record.status = "success";
      else if (record.stopRequested) record.status = "stopped";
      else record.status = "error";
    }
  } catch (error) {
    record.pollFails = (record.pollFails || 0) + 1;
    if (record.pollFails >= 3) {
      record.status = "error";
      record.error = error.message;
      record.finishedAt = new Date().toISOString();
    }
  }
}

async function refreshRunning() {
  const running = transfers.filter((item) => item.status === "running");
  if (!running.length) return;
  const rc = await engine();
  await Promise.all(running.map((record) => refreshTransfer(rc, record)));
  saveHistory();
}

function publicTransfer(record) {
  return {
    id: record.id,
    jobId: record.jobId,
    mode: record.mode,
    dryRun: record.dryRun,
    source: record.source,
    dest: record.dest,
    sourceLabel: record.sourceLabel,
    destLabel: record.destLabel,
    file: record.file || "",
    includeExt: record.includeExt,
    minSize: record.minSize,
    maxSize: record.maxSize,
    startedAt: record.startedAt,
    finishedAt: record.finishedAt,
    status: record.status,
    error: record.status === "stopped" && /context cancel/i.test(record.error || "") ? "" : (record.error || ""),
    stats: record.stats || null,
  };
}

async function handle(req, res) {
  const url = new URL(req.url || "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/api/health") {
    const rc = await engine();
    const version = await rc.call("core/version", {}, 8000);
    send(res, 200, { ok: true, version: version.version, os: version.os });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/home") {
    send(res, 200, { path: os.homedir() });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/remotes") {
    const rc = await engine();
    const { remotes } = await remoteCatalog(rc);
    send(res, 200, { remotes });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/about") {
    const name = url.searchParams.get("name") || "";
    const rc = await engine();
    const { names } = await remoteCatalog(rc);
    if (!names.has(name)) throw bad("Cloud inconnu.");
    const cached = aboutCache.get(name);
    if (cached && Date.now() - cached.at < 45_000) {
      send(res, 200, cached.body);
      return;
    }
    try {
      const about = await rc.call("operations/about", { fs: `${name}:` }, 10000);
      const body = {
        ok: true,
        total: about.total ?? null,
        used: about.used ?? null,
        free: about.free ?? null,
      };
      aboutCache.set(name, { at: Date.now(), body });
      send(res, 200, body);
    } catch (error) {
      const message = String(error.message || "");
      const unsupported = /not supported|does not support|doesn't support|not implemented|unknown method/i.test(message);
      const body = {
        ok: false,
        unsupported,
        error: unsupported ? "Ce cloud ne communique pas son quota." : message.slice(0, 240),
      };
      aboutCache.set(name, { at: Date.now(), body });
      send(res, 200, body);
    }
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/list") {
    const body = await readBody(req);
    const location = normalizeLocation(body.location, "Dossier");
    const rc = await engine();
    const { names } = await remoteCatalog(rc);
    assertKnownRemote(location, names);
    assertLocalDir(location);
    const listed = await rc.call(
      "operations/list",
      { fs: toFs(location), remote: "" },
      45000,
    );
    const entries = (listed.list || []).map((item) => ({
      name: item.Name,
      path: item.Path || item.Name,
      isDir: Boolean(item.IsDir),
      size: item.Size ?? 0,
      modTime: item.ModTime || "",
    }));
    send(res, 200, { entries });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/mkdir") {
    const body = await readBody(req);
    const location = normalizeLocation(body.location, "Dossier");
    const name = String(body.name || "").trim();
    if (!name || name.includes("/") || name === "." || name === "..") {
      throw bad("Nom de dossier invalide.");
    }
    const rc = await engine();
    const { names } = await remoteCatalog(rc);
    assertKnownRemote(location, names);
    assertLocalDir(location);
    await rc.call("operations/mkdir", { fs: toFs(location), remote: name }, 20000);
    send(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && url.pathname === "/api/transfers") {
    await refreshRunning();
    const sorted = [...transfers].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)));
    send(res, 200, { transfers: sorted.map(publicTransfer) });
    return;
  }

  if (req.method === "POST" && url.pathname === "/api/transfers") {
    const body = await readBody(req);
    if (!MODES.has(body.mode)) throw bad("Mode invalide.");
    const source = normalizeLocation(body.source, "Source");
    const dest = normalizeLocation(body.dest, "Destination");
    const rc = await engine();
    const { names } = await remoteCatalog(rc);
    assertKnownRemote(source, names);
    assertKnownRemote(dest, names);
    assertLocalDir(source);
    if (!body.dryRun && dest.kind === "local" && !fs.existsSync(dest.path)) {
      fs.mkdirSync(dest.path, { recursive: true });
    }
    const srcFs = toFs(source);
    const dstFs = toFs(dest);
    const fileName = normalizeFileName(body.file);
    if (srcFs === dstFs) throw bad("La source et la destination sont identiques.");
    let method;
    let payload;
    if (fileName) {
      if (body.mode === "sync") {
        throw bad("Un fichier se copie ou se déplace. La synchro reste réservée à un dossier.");
      }
      if (source.kind === "local") {
        const full = path.join(source.path, fileName);
        let stat;
        try {
          stat = fs.statSync(full);
        } catch {
          throw bad("Fichier introuvable.");
        }
        if (!stat.isFile()) throw bad("Ce n’est pas un fichier.");
      }
      method = body.mode === "move" ? "operations/movefile" : "operations/copyfile";
      payload = {
        srcFs,
        srcRemote: fileName,
        dstFs,
        dstRemote: fileName,
        _async: true,
      };
      if (body.dryRun) payload._config = { DryRun: true };
    } else {
      method = body.mode === "sync" ? "sync/sync" : body.mode === "move" ? "sync/move" : "sync/copy";
      payload = {
        srcFs,
        dstFs,
        createEmptySrcDirs: true,
        _async: true,
      };
      const filter = buildFilter(body);
      if (body.dryRun) payload._config = { DryRun: true };
      if (filter) payload._filter = filter;
    }
    const started = await rc.call(method, payload, 20000);
    const record = {
      id: crypto.randomUUID(),
      jobId: started.jobid,
      group: `job/${started.jobid}`,
      mode: body.mode,
      dryRun: Boolean(body.dryRun),
      source,
      dest,
      sourceLabel: labelWithFile(source, fileName),
      destLabel: labelWithFile(dest, fileName),
      file: fileName,
      includeExt: fileName ? [] : normalizeExts(body.includeExt),
      minSize: normalizeSize(body.minSize) || "",
      maxSize: normalizeSize(body.maxSize) || "",
      startedAt: new Date().toISOString(),
      finishedAt: null,
      status: "running",
      error: "",
      stats: null,
      stopRequested: false,
      pollFails: 0,
    };
    transfers.unshift(record);
    transfers = transfers.slice(0, 80);
    saveHistory();
    send(res, 201, { transfer: publicTransfer(record) });
    return;
  }

  const stopMatch = url.pathname.match(/^\/api\/transfers\/([^/]+)\/stop$/);
  if (req.method === "POST" && stopMatch) {
    const record = transfers.find((item) => item.id === decodeURIComponent(stopMatch[1]));
    if (!record) {
      send(res, 404, { error: "Transfert introuvable." });
      return;
    }
    if (record.status === "running") {
      record.stopRequested = true;
      const rc = await engine();
      try {
        await rc.call("job/stop", { jobid: record.jobId }, 10000);
      } catch (error) {
        record.error = String(error.message || "").slice(0, 500);
      }
      const deadline = Date.now() + 2500;
      while (record.status === "running" && Date.now() < deadline) {
        await refreshTransfer(rc, record);
        if (record.status === "running") await new Promise((resolve) => setTimeout(resolve, 150));
      }
      saveHistory();
    }
    send(res, 200, { transfer: publicTransfer(record) });
    return;
  }

  send(res, 404, { error: "Introuvable." });
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((error) => {
    if (res.headersSent) return;
    const status = error.status || 500;
    send(res, status, { error: error.message || "Erreur interne." });
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`rclone-gui API http://127.0.0.1:${PORT}`);
});

function shutdown() {
  if (rclone) rclone.stop();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

saveHistory();
