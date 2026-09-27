import { useEffect, useState } from "react";
import { api } from "../api";
import { formatBytes, formatWhen, locationLabel } from "../format";
import { useStore } from "../store";
import type { Entry, Location } from "../types";

function join(location: Location, name: string): Location {
  if (location.kind === "local") {
    const base = location.path === "/" ? "" : location.path.replace(/\/$/, "");
    return { ...location, path: `${base}/${name}` };
  }
  return { ...location, path: location.path ? `${location.path}/${name}` : name };
}

function parentOf(location: Location): Location | null {
  if (location.kind === "local") {
    if (location.path === "/") return null;
    const next = location.path.split("/").slice(0, -1).join("/") || "/";
    return { kind: "local", path: next };
  }
  if (!location.path) return null;
  const parts = location.path.split("/").filter(Boolean);
  parts.pop();
  return { kind: "remote", name: location.name, path: parts.join("/") };
}

function crumbs(location: Location) {
  if (location.kind === "local") {
    const parts = location.path.split("/").filter(Boolean);
    const items = [{ label: "racine", path: "/" }];
    let current = "";
    for (const part of parts) {
      current += `/${part}`;
      items.push({ label: part, path: current });
    }
    return items;
  }
  const items = [{ label: location.name || "cloud", path: "" }];
  const parts = location.path.split("/").filter(Boolean);
  let current = "";
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    items.push({ label: part, path: current });
  }
  return items;
}

function Pane({
  title,
  location,
  pickedName,
  onChange,
  onPick,
}: {
  title: string;
  location: Location;
  pickedName: string;
  onChange: (location: Location) => void;
  onPick: (name: string) => void;
}) {
  const { remotes, home } = useStore();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const ready = location.kind === "remote" ? Boolean(location.name) : Boolean(location.path);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    setLoading(true);
    setError("");
    api.list(location).then((result) => {
      if (cancelled) return;
      const sorted = [...result.entries].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, "fr"));
      setEntries(sorted);
      setLoading(false);
    }).catch((reason: Error) => {
      if (cancelled) return;
      setEntries([]);
      setError(reason.message);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [location, ready, reloadKey]);

  const parent = parentOf(location);

  async function createFolder() {
    const name = folderName.trim();
    if (!name) return;
    await api.mkdir(location, name);
    setFolderName("");
    const refreshed = await api.list(location);
    setEntries([...refreshed.entries].sort((a, b) => Number(b.isDir) - Number(a.isDir) || a.name.localeCompare(b.name, "fr")));
  }

  return (
    <section className="panel">
      <div className="panel-head">
        <strong>{title}</strong>
        <select
          aria-label={`Emplacement ${title}`}
          value={location.kind === "local" ? "local" : location.name}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "local") onChange({ kind: "local", path: home });
            else onChange({ kind: "remote", name: value, path: "" });
          }}
        >
          <option value="local">Local</option>
          {remotes.map((remote) => (
            <option key={remote.name} value={remote.name}>{remote.name}</option>
          ))}
        </select>
        <button className="ghost" type="button" disabled={!parent} onClick={() => parent && onChange(parent)}>Remonter</button>
        <button
          className="ghost"
          type="button"
          aria-label={`Rafraîchir ${title}`}
          disabled={!ready || loading}
          onClick={() => setReloadKey((key) => key + 1)}
        >
          {loading ? "…" : "Rafraîchir"}
        </button>
      </div>
      <div className="crumbs">
        {crumbs(location).map((item) => (
          <button
            key={`${item.path}-${item.label}`}
            type="button"
            onClick={() => onChange(location.kind === "local"
              ? { kind: "local", path: item.path }
              : { kind: "remote", name: location.name, path: item.path })}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="file-list">
        {loading ? <p className="empty">Chargement…</p> : null}
        {error ? <p className="error-note">{error}</p> : null}
        {!loading && !error && !entries.length ? <p className="empty">Dossier vide.</p> : null}
        {entries.map((entry) => (
          <button
            className={pickedName === entry.name && !entry.isDir ? "file is-picked" : "file"}
            type="button"
            key={entry.path}
            aria-pressed={!entry.isDir && pickedName === entry.name}
            onClick={() => (entry.isDir ? onChange(join(location, entry.name)) : onPick(entry.name))}
          >
            <span className={entry.isDir ? "dir-mark" : "faint"}>{entry.isDir ? "▸" : "·"}</span>
            <strong>{entry.name}</strong>
            <em>{entry.isDir ? "dossier" : formatBytes(entry.size)}{entry.modTime ? ` · ${formatWhen(entry.modTime)}` : ""}</em>
          </button>
        ))}
      </div>
      <div className="panel-foot">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createFolder().catch((reason: Error) => setError(reason.message));
          }}
        >
          <input
            type="text"
            value={folderName}
            placeholder="Nouveau dossier"
            aria-label={`Nouveau dossier dans ${title}`}
            onChange={(event) => setFolderName(event.target.value)}
          />
        </form>
        <span>{entries.length ? `${entries.length} élément${entries.length > 1 ? "s" : ""}` : ""}</span>
      </div>
    </section>
  );
}

export function ExplorerPage() {
  const { source, dest, setSource, setDest, draft, setDraft, setFocusId } = useStore();
  const [picked, setPicked] = useState<{ side: "source" | "dest"; name: string } | null>(null);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const from = picked?.side === "dest" ? dest : source;
  const to = picked?.side === "dest" ? source : dest;

  function changeSource(location: Location) {
    setSource(location);
    setPicked((current) => (current?.side === "source" ? null : current));
  }

  function changeDest(location: Location) {
    setDest(location);
    setPicked((current) => (current?.side === "dest" ? null : current));
  }

  async function send(mode: "copy" | "move") {
    if (!picked) return;
    setPending(true);
    setError("");
    setConfirming(false);
    try {
      const result = await api.startTransfer({
        mode,
        dryRun: draft.dryRun,
        source: from,
        dest: to,
        file: picked.name,
        includeExt: "",
        minSize: "",
        maxSize: "",
      });
      setFocusId(result.transfer.id);
      window.location.hash = "#/transfert";
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Le fichier n’a pas été envoyé");
    } finally {
      setPending(false);
    }
  }

  function ask(mode: "copy" | "move") {
    if (mode === "move" && !draft.dryRun) {
      setConfirming(true);
      return;
    }
    void send(mode);
  }

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Explorateur</h1>
          <p className="lede">Ouvre le dossier de destination à droite. Pour un seul fichier, clique-le, puis copie-le. Le dossier entier se prépare à part.</p>
        </div>
        <a className="primary" href="#/transfert">Préparer un dossier</a>
      </header>
      {picked ? (
        <div className="file-action">
          <strong>{picked.name}</strong>
          <span className="hint">vers {locationLabel(to)}</span>
          <label className="check">
            <input
              type="checkbox"
              checked={draft.dryRun}
              onChange={(event) => setDraft({ ...draft, dryRun: event.target.checked })}
            />
            Essai à blanc
          </label>
          <button className="primary" type="button" disabled={pending} onClick={() => ask("copy")}>Copier ce fichier</button>
          <button className="ghost" type="button" disabled={pending} onClick={() => ask("move")}>Déplacer</button>
        </div>
      ) : null}
      {error ? <p className="error-note">{error}</p> : null}
      <div className="panes">
        <Pane
          title="Source"
          location={source}
          pickedName={picked?.side === "source" ? picked.name : ""}
          onChange={changeSource}
          onPick={(name) => setPicked((current) => (current?.side === "source" && current.name === name ? null : { side: "source", name }))}
        />
        <Pane
          title="Destination"
          location={dest}
          pickedName={picked?.side === "dest" ? picked.name : ""}
          onChange={changeDest}
          onPick={(name) => setPicked((current) => (current?.side === "dest" && current.name === name ? null : { side: "dest", name }))}
        />
      </div>
      {confirming && picked ? (
        <div className="modal-back" role="presentation">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="move-file-title">
            <h2 id="move-file-title">Déplacer ce fichier ?</h2>
            <p>Le fichier sera retiré de son emplacement d’origine après la copie.</p>
            <p className="hint">{picked.name} → {locationLabel(to)}</p>
            <div className="actions">
              <button className="ghost" type="button" onClick={() => setConfirming(false)}>Annuler</button>
              <button className="danger" type="button" onClick={() => void send("move")}>Continuer</button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
