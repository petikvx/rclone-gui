import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import type { Location, Remote, TransferDraft } from "./types";

type StoreValue = {
  home: string;
  remotes: Remote[];
  remoteError: string;
  version: string;
  source: Location;
  dest: Location;
  draft: TransferDraft;
  focusId: string | null;
  setFocusId: (id: string | null) => void;
  setSource: (location: Location) => void;
  setDest: (location: Location) => void;
  setDraft: (draft: TransferDraft) => void;
  reloadRemotes: () => Promise<void>;
};

const StoreContext = createContext<StoreValue | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [home, setHome] = useState("");
  const [remotes, setRemotes] = useState<Remote[]>([]);
  const [remoteError, setRemoteError] = useState("");
  const [version, setVersion] = useState("");
  const [source, setSource] = useState<Location>({ kind: "local", path: "" });
  const [dest, setDest] = useState<Location>({ kind: "local", path: "" });
  const [destTouched, setDestTouched] = useState(false);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [draft, setDraft] = useState<TransferDraft>({
    mode: "copy",
    dryRun: true,
    includeExt: "",
    minSize: "",
    maxSize: "",
  });

  async function reloadRemotes() {
    const [health, homeInfo, catalog] = await Promise.all([api.health(), api.home(), api.remotes()]);
    setVersion(health.version);
    setHome(homeInfo.path);
    setRemotes(catalog.remotes);
    setRemoteError("");
    setSource((current) => (current.path ? current : { kind: "local", path: homeInfo.path }));
    setDest((current) => {
      if (destTouched || current.kind === "remote" || (current.path && current.path !== homeInfo.path)) return current;
      if (catalog.remotes[0]) return { kind: "remote", name: catalog.remotes[0].name, path: "" };
      return { kind: "local", path: homeInfo.path };
    });
  }

  useEffect(() => {
    reloadRemotes().catch((error: Error) => setRemoteError(error.message));
    // Chargement initial uniquement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const value = useMemo(
    () => ({
      home,
      remotes,
      remoteError,
      version,
      source,
      dest,
      draft,
      focusId,
      setFocusId,
      setSource,
      setDest: (location: Location) => {
        setDestTouched(true);
        setDest(location);
      },
      setDraft,
      reloadRemotes,
    }),
    [home, remotes, remoteError, version, source, dest, draft, focusId],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Contexte manquant");
  return value;
}
