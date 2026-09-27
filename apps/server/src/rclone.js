import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";

const PROVIDERS = {
  alias: "Alias",
  azureblob: "Azure Blob",
  b2: "Backblaze B2",
  box: "Box",
  cache: "Cache",
  chunker: "Chunker",
  combine: "Combine",
  compress: "Compress",
  crypt: "Chiffré",
  drive: "Google Drive",
  dropbox: "Dropbox",
  fichier: "1Fichier",
  ftp: "FTP",
  gcs: "Google Cloud Storage",
  hidrive: "HiDrive",
  internetarchive: "Internet Archive",
  jottacloud: "Jottacloud",
  koofr: "Koofr",
  local: "Local",
  mailru: "Mail.ru",
  mega: "MEGA",
  onedrive: "OneDrive",
  opendrive: "OpenDrive",
  pcloud: "pCloud",
  protondrive: "Proton Drive",
  qingstor: "QingStor",
  s3: "S3",
  sftp: "SFTP",
  sia: "Sia",
  smb: "SMB",
  storj: "Storj",
  swift: "Swift",
  union: "Union",
  webdav: "WebDAV",
  yandex: "Yandex",
};

export function providerLabel(type) {
  return PROVIDERS[type] || type || "Cloud";
}

export function configDir() {
  const dir = path.join(os.homedir(), ".config", "rclone-gui");
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

function socketPath() {
  const runtime = process.env.XDG_RUNTIME_DIR;
  const dir = runtime && fs.existsSync(runtime) ? runtime : configDir();
  return path.join(dir, "rclone-gui.sock");
}

async function rcCall(sock, user, pass, method, body, timeoutMs) {
  const payload = Buffer.from(JSON.stringify(body ?? {}));
  const auth = Buffer.from(`${user}:${pass}`).toString("base64");
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        socketPath: sock,
        path: `/${method}`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Content-Length": payload.length,
          Authorization: `Basic ${auth}`,
        },
        signal: AbortSignal.timeout(timeoutMs),
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = {};
          if (text) {
            try {
              data = JSON.parse(text);
            } catch {
              data = { error: text.slice(0, 400) };
            }
          }
          if ((res.statusCode ?? 500) >= 400) {
            const error = new Error(data.error || `rclone a répondu ${res.statusCode}`);
            error.status = 502;
            reject(error);
            return;
          }
          resolve(data);
        });
      },
    );
    req.on("error", (error) => {
      error.status = 503;
      reject(error);
    });
    req.write(payload);
    req.end();
  });
}

export async function startRclone() {
  const sock = socketPath();
  try {
    if (fs.existsSync(sock)) fs.unlinkSync(sock);
  } catch {
    // Le prochain essai de connexion rendra l'échec explicite.
  }

  const user = "gui";
  const pass = crypto.randomBytes(18).toString("hex");
  const logFile = path.join(configDir(), "rclone.log");
  let stderr = "";
  const child = spawn(
    "rclone",
    ["rcd", "--log-file", logFile, "--log-level", "NOTICE"],
    {
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        RCLONE_RC_ADDR: `unix://${sock}`,
        RCLONE_RC_USER: user,
        RCLONE_RC_PASS: pass,
      },
    },
  );
  child.stdout.on("data", () => {});
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-4000);
  });

  let exited = null;
  child.once("exit", (code) => {
    exited = code ?? 0;
  });

  const deadline = Date.now() + 8000;
  let ready = false;
  let lastError = null;
  while (Date.now() < deadline) {
    if (exited !== null) break;
    if (fs.existsSync(sock)) {
      try {
        await rcCall(sock, user, pass, "core/version", {}, 1500);
        ready = true;
        break;
      } catch (error) {
        lastError = error;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  if (!ready) {
    if (exited === null) child.kill("SIGTERM");
    const detail = stderr.trim() || lastError?.message || "délai dépassé";
    const error = new Error(`rclone ne démarre pas. ${detail}`);
    error.status = 503;
    throw error;
  }

  try {
    fs.chmodSync(sock, 0o600);
  } catch {
    // Le socket reste dans le répertoire privé de l'utilisateur.
  }

  return {
    child,
    async call(method, body = {}, timeoutMs = 30000) {
      return rcCall(sock, user, pass, method, body, timeoutMs);
    },
    stop() {
      if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
    },
  };
}
