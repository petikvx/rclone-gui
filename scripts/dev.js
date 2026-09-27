import { spawn } from "node:child_process";
import { setTimeout as wait } from "node:timers/promises";

const server = spawn(process.execPath, ["apps/server/src/index.js"], {
  stdio: "inherit",
  env: { ...process.env, PORT: process.env.PORT || "8787" },
});

const vite = spawn("npm", ["run", "dev", "-w", "web"], {
  stdio: "inherit",
  env: process.env,
});

let opened = false;

async function openWhenReady() {
  if (process.env.NO_OPEN === "1") return;
  for (let i = 0; i < 50; i += 1) {
    try {
      const response = await fetch("http://127.0.0.1:5173/");
      if (response.ok && !opened) {
        opened = true;
        spawn("xdg-open", ["http://127.0.0.1:5173/"], {
          stdio: "ignore",
          detached: true,
        }).unref();
        return;
      }
    } catch {
      // Vite est encore en train de démarrer.
    }
    await wait(250);
  }
}

openWhenReady();

function shutdown() {
  server.kill("SIGTERM");
  vite.kill("SIGTERM");
  setTimeout(() => process.exit(0), 400);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.on("exit", (code, signal) => {
  if (signal) return;
  if (code) {
    vite.kill("SIGTERM");
    process.exit(code);
  }
});
