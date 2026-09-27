import { useEffect, useState } from "react";
import { api } from "../api";
import { formatBytes, locationLabel, tintFor } from "../format";
import { useStore } from "../store";
import type { About, Remote } from "../types";

function CloudCard({ remote, onOpen }: { remote: Remote; onOpen: () => void }) {
  const [about, setAbout] = useState<About | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.about(remote.name).then((result) => {
      if (!cancelled) setAbout(result);
    }).catch((error: Error) => {
      if (!cancelled) setAbout({ ok: false, error: error.message });
    });
    return () => {
      cancelled = true;
    };
  }, [remote.name]);

  const quota = about?.ok && about.total && about.used != null
    ? Math.min(100, Math.round((about.used / about.total) * 100))
    : null;

  return (
    <button className="card" onClick={onOpen}>
      <div className="card-top">
        <span className="mark" style={{ background: tintFor(remote.type) }}>{remote.name.slice(0, 2).toUpperCase()}</span>
        <span className="faint">{remote.label}</span>
      </div>
      <div>
        <h3>{remote.name}</h3>
        <p className="hint">{locationLabel({ kind: "remote", name: remote.name, path: "" })}</p>
      </div>
      <div className="quota">
        {quota != null && about?.used != null && about.total != null ? (
          <>
            <div className="quota-track"><div style={{ width: `${quota}%` }} /></div>
            <span>{formatBytes(about.used)} sur {formatBytes(about.total)}</span>
          </>
        ) : (
          <span>{about ? (about.error || "Quota non communiqué") : "Quota…"}</span>
        )}
      </div>
    </button>
  );
}

export function CloudsPage() {
  const { remotes, home, setSource } = useStore();
  const groups = new Map<string, Remote[]>();
  for (const remote of remotes) {
    groups.set(remote.label, [...(groups.get(remote.label) || []), remote]);
  }

  return (
    <section>
      <header className="page-head">
        <div>
          <h1>Nuages</h1>
          <p className="lede">Les clouds déjà présents dans rclone. Ouvrir une carte pour le parcourir, puis l’envoyer vers un autre cloud ou vers cet ordinateur.</p>
        </div>
      </header>
      <div className="groups">
        <div className="group">
          <h2>Local</h2>
          <div className="cards">
            <button
              className="card local-card"
              onClick={() => {
                setSource({ kind: "local", path: home });
                window.location.hash = "#/explorateur";
              }}
            >
              <div className="card-top">
                <span className="mark mark-word" style={{ background: tintFor("local") }}>Local</span>
                <span className="faint">Dossier local</span>
              </div>
              <div>
                <h3>Local</h3>
                <p className="hint">{home || "…"}</p>
              </div>
            </button>
          </div>
        </div>
        {[...groups.entries()].map(([label, items]) => (
          <div className="group" key={label}>
            <h2>{label}</h2>
            <div className="cards">
              {items.map((remote) => (
                <CloudCard
                  key={remote.name}
                  remote={remote}
                  onOpen={() => {
                    setSource({ kind: "remote", name: remote.name, path: "" });
                    window.location.hash = "#/explorateur";
                  }}
                />
              ))}
            </div>
          </div>
        ))}
        {!remotes.length ? <p className="empty">Aucun cloud configuré dans rclone.</p> : null}
      </div>
    </section>
  );
}
