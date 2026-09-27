import { useEffect, useState } from "react";
import { api } from "../api";
import { formatBytes, formatWhen, modeLabel, statusLabel } from "../format";
import type { Transfer } from "../types";

export function ActivityPage() {
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const result = await api.transfers();
        if (!cancelled) {
          setTransfers(result.transfers);
          setError("");
        }
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Journal indisponible");
      }
    }
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const running = transfers.filter((item) => item.status === "running");
  const done = transfers.filter((item) => item.status !== "running");

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Activité</h1>
          <p className="lede">La file des transferts en cours et le journal de ceux qui sont terminés. L’arrêt coupe le travail rclone correspondant.</p>
        </div>
      </header>
      {error ? <p className="error-note">{error}</p> : null}
      <h2>En cours</h2>
      <div className="activity">
        {!running.length ? <p className="empty">Aucun transfert en cours.</p> : null}
        {running.map((item) => (
          <article className="job panel" key={item.id}>
            <header>
              <span className={`pill ${item.status}`}>{statusLabel(item.status)}</span>
              <strong>{modeLabel(item.mode)}</strong>
              {item.dryRun ? <span className="pill">essai à blanc</span> : null}
              {item.file ? <span className="pill">1 fichier</span> : null}
            </header>
            <button className="danger" type="button" onClick={() => api.stopTransfer(item.id).catch((reason: Error) => setError(reason.message))}>
              Arrêter
            </button>
            <p className="pathline">{item.sourceLabel} → {item.destLabel}</p>
            <p className="hint">
              {item.stats ? `${formatBytes(item.stats.bytes)} · ${formatBytes(item.stats.speed)}/s · ${item.stats.transfers} fichiers` : "Démarrage…"}
            </p>
          </article>
        ))}
      </div>
      <h2 style={{ marginTop: 22 }}>Journal</h2>
      <div className="activity">
        {!done.length ? <p className="empty">Les transferts terminés apparaîtront ici.</p> : null}
        {done.map((item) => (
          <article className="job panel" key={item.id}>
            <header>
              <span className={`pill ${item.status}`}>{statusLabel(item.status)}</span>
              <strong>{modeLabel(item.mode)}</strong>
              {item.dryRun ? <span className="pill">essai à blanc</span> : null}
              {item.file ? <span className="pill">1 fichier</span> : null}
              <span className="faint">{formatWhen(item.finishedAt || item.startedAt)}</span>
            </header>
            <span />
            <p className="pathline">{item.sourceLabel} → {item.destLabel}</p>
            <p className="hint">
              {item.includeExt.length ? `Filtre : ${item.includeExt.join(", ")}. ` : ""}
              {item.minSize ? `Min ${item.minSize}. ` : ""}
              {item.maxSize ? `Max ${item.maxSize}. ` : ""}
              {item.stats ? `${formatBytes(item.stats.bytes)} ${item.dryRun ? "simulés" : "envoyés"}. ` : ""}
              {item.error}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
}
