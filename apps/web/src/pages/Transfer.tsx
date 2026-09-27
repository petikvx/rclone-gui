import { useEffect, useState } from "react";
import { api } from "../api";
import { formatBytes, formatEta, locationLabel, modeLabel, statusLabel, tintFor } from "../format";
import { useStore } from "../store";
import type { Location, Transfer } from "../types";

function PlaceEditor({
  title,
  location,
  onChange,
}: {
  title: string;
  location: Location;
  onChange: (location: Location) => void;
}) {
  const { remotes, home } = useStore();
  const type = location.kind === "local"
    ? "local"
    : remotes.find((remote) => remote.name === location.name)?.type || "cloud";

  return (
    <article className="end">
      <div className="end-top">
        <span className={`mark${location.kind === "local" ? " mark-word" : ""}`} style={{ background: tintFor(type) }}>
          {location.kind === "local" ? "Local" : (location.name || "?").slice(0, 2).toUpperCase()}
        </span>
        <span className="faint">{title}</span>
      </div>
      <select
        aria-label={title}
        value={location.kind === "local" ? "local" : location.name}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "local") onChange({ kind: "local", path: home });
          else onChange({ kind: "remote", name: value, path: "" });
        }}
      >
        <option value="local">Local</option>
        {remotes.map((remote) => (
          <option key={remote.name} value={remote.name}>{remote.name} · {remote.label}</option>
        ))}
      </select>
      <input
        type="text"
        aria-label={`Chemin ${title}`}
        value={location.path}
        placeholder={location.kind === "local" ? "/chemin/absolu" : "dossier/dans/le/cloud"}
        onChange={(event) => onChange({ ...location, path: event.target.value })}
      />
      <p className="hint">{locationLabel(location)}</p>
    </article>
  );
}

function Progress({ transfer, onStop }: { transfer: Transfer; onStop: () => void }) {
  const stats = transfer.stats;
  const percent = stats && stats.totalBytes > 0
    ? Math.min(100, Math.round((stats.bytes / stats.totalBytes) * 100))
    : null;

  return (
    <section className="progress-card">
      <div className="row-between">
        <strong>{statusLabel(transfer.status)}{transfer.dryRun ? " · essai à blanc" : ""}{transfer.file ? ` · ${transfer.file}` : ""}</strong>
        {transfer.status === "running" ? (
          <button className="danger" type="button" onClick={onStop}>Arrêter</button>
        ) : null}
      </div>
      <p className="hint">{transfer.sourceLabel} → {transfer.destLabel}</p>
      <div className="bar"><div style={{ width: `${percent ?? (transfer.status === "running" ? 12 : 100)}%` }} /></div>
      <div className="metrics">
        <div><span>Volume</span><strong>{stats ? `${formatBytes(stats.bytes)} / ${formatBytes(stats.totalBytes)}` : "—"}</strong></div>
        <div><span>Débit</span><strong>{stats ? `${formatBytes(stats.speed)}/s` : "—"}</strong></div>
        <div><span>Restant</span><strong>{formatEta(stats?.eta)}</strong></div>
        <div><span>Fichiers</span><strong>{stats ? `${stats.transfers} / ${stats.totalTransfers}` : "—"}</strong></div>
        <div><span>Erreurs</span><strong>{stats?.errors || 0}</strong></div>
      </div>
      {stats?.transferring?.length ? (
        <div className="file-progress">
          {stats.transferring.map((file) => (
            <div key={file.name}>
              <div className="row"><span>{file.name}</span><span>{Math.round(file.percentage)} %</span></div>
              <div className="bar"><div style={{ width: `${Math.min(100, file.percentage)}%` }} /></div>
            </div>
          ))}
        </div>
      ) : null}
      {transfer.error ? <p className="error-note">{transfer.error}</p> : null}
      {stats?.lastError && stats.lastError !== transfer.error ? <p className="error-note">{stats.lastError}</p> : null}
      {stats?.recentErrors?.map((item) => (
        <p className="hint" key={`${item.name}-${item.error}`}>{item.name} — {item.error}</p>
      ))}
    </section>
  );
}

export function TransferPage() {
  const { source, dest, setSource, setDest, draft, setDraft, focusId } = useStore();
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function tick() {
      try {
        const result = await api.transfers();
        if (!cancelled) setTransfers(result.transfers);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : "Erreur de suivi");
      }
    }
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  const shownId = activeId || focusId;
  const active = transfers.find((item) => item.id === shownId) || transfers.find((item) => item.status === "running") || null;

  async function start() {
    setPending(true);
    setError("");
    setConfirming(false);
    try {
      const result = await api.startTransfer({
        mode: draft.mode,
        dryRun: draft.dryRun,
        source,
        dest,
        includeExt: draft.includeExt,
        minSize: draft.minSize,
        maxSize: draft.maxSize,
      });
      setActiveId(result.transfer.id);
      setTransfers((current) => [result.transfer, ...current.filter((item) => item.id !== result.transfer.id)]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le transfert n’a pas démarré");
    } finally {
      setPending(false);
    }
  }

  function askStart() {
    if (!draft.dryRun && (draft.mode === "sync" || draft.mode === "move")) {
      setConfirming(true);
      return;
    }
    void start();
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Transfert</h1>
          <p className="lede">D’un cloud à l’autre, ou entre cet ordinateur et un cloud. L’essai à blanc est coché : rien n’est écrit tant qu’on ne le décoche pas.</p>
        </div>
      </header>

      {draft.dryRun ? <p className="banner">Essai à blanc : rclone simule le transfert, aucun fichier n’est écrit.</p> : null}
      {error ? <p className="error-note">{error}</p> : null}

      <div className="bridge">
        <PlaceEditor title="Source" location={source} onChange={setSource} />
        <div className="connector" data-live={active?.status === "running" ? "true" : "false"}>
          <span className="connector-line" />
          <span className="badge">{modeLabel(draft.mode)}</span>
          <span className="connector-line" />
        </div>
        <PlaceEditor title="Destination" location={dest} onChange={setDest} />
      </div>

      <div className="controls">
        <div className="field">
          <span>Mode</span>
          <div className="seg">
            {(["copy", "sync", "move"] as const).map((mode) => (
              <button key={mode} type="button" aria-pressed={draft.mode === mode} onClick={() => setDraft({ ...draft, mode })}>
                {modeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
        <label className="check">
          <input
            type="checkbox"
            checked={draft.dryRun}
            onChange={(event) => setDraft({ ...draft, dryRun: event.target.checked })}
          />
          Essai à blanc
        </label>
      </div>

      <div className="filters">
        <label className="field grow">
          <span>Extensions</span>
          <input
            type="text"
            value={draft.includeExt}
            placeholder="jpg, png, pdf"
            onChange={(event) => setDraft({ ...draft, includeExt: event.target.value })}
          />
        </label>
        <label className="field">
          <span>Taille min.</span>
          <input type="text" value={draft.minSize} placeholder="1M" onChange={(event) => setDraft({ ...draft, minSize: event.target.value })} />
        </label>
        <label className="field">
          <span>Taille max.</span>
          <input type="text" value={draft.maxSize} placeholder="2G" onChange={(event) => setDraft({ ...draft, maxSize: event.target.value })} />
        </label>
      </div>
      <p className="hint">Sans extension, tous les fichiers du dossier sont pris. Les tailles utilisent la notation rclone : 500K, 10M, 1G. La copie remplace à la destination les fichiers différents. La synchro efface aussi ce qui n’existe plus dans la source. Le déplacement retire les fichiers de la source.</p>

      <div className="actions">
        <button className="primary" type="button" disabled={pending} onClick={askStart}>
          {pending ? "Démarrage…" : draft.dryRun ? "Lancer l’essai" : `Lancer : ${modeLabel(draft.mode).toLowerCase()}`}
        </button>
        <a className="ghost" href="#/explorateur">Choisir dans l’explorateur</a>
      </div>

      {active ? (
        <Progress
          transfer={active}
          onStop={() => {
            api.stopTransfer(active.id).catch((reason: Error) => setError(reason.message));
          }}
        />
      ) : null}

      {confirming ? (
        <div className="modal-back" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
            <h2 id="confirm-title">{draft.mode === "sync" ? "Synchroniser pour de vrai ?" : "Déplacer pour de vrai ?"}</h2>
            <p>
              {draft.mode === "sync"
                ? "La synchronisation rend la destination identique à la source. Les fichiers présents seulement dans la destination seront supprimés."
                : "Le déplacement retire les fichiers de la source après leur copie."}
            </p>
            <p className="hint">{locationLabel(source)} → {locationLabel(dest)}</p>
            <div className="actions">
              <button className="ghost" type="button" onClick={() => setConfirming(false)}>Annuler</button>
              <button className="danger" type="button" onClick={() => void start()}>Continuer</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
