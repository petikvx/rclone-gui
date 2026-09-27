import { useEffect, useState } from "react";
import { APP_VERSION, CREDIT } from "./history";
import { AboutPage } from "./pages/About";
import { ActivityPage } from "./pages/Activity";
import { CloudsPage } from "./pages/Clouds";
import { ExplorerPage } from "./pages/Explorer";
import { TransferPage } from "./pages/Transfer";
import { StoreProvider, useStore } from "./store";

const LINKS = [
  { hash: "#/nuages", label: "Nuages" },
  { hash: "#/explorateur", label: "Explorateur" },
  { hash: "#/transfert", label: "Transfert" },
  { hash: "#/activite", label: "Activité" },
  { hash: "#/propos", label: "À propos" },
];

function Shell() {
  const { version, remoteError } = useStore();
  const [hash, setHash] = useState(() => window.location.hash || "#/nuages");

  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/nuages");
    window.addEventListener("hashchange", onChange);
    if (!window.location.hash) window.location.hash = "#/nuages";
    return () => window.removeEventListener("hashchange", onChange);
  }, []);

  const explorer = hash.startsWith("#/explorateur");

  return (
    <div className="app">
      <aside className="side">
        <div className="brand">
          <strong>rclone</strong>
          <span>gui locale</span>
        </div>
        <nav className="nav">
          {LINKS.map((link) => (
            <a key={link.hash} href={link.hash} aria-current={hash.startsWith(link.hash) ? "page" : undefined}>
              <i />
              {link.label}
            </a>
          ))}
        </nav>
        <p className="side-foot">
          <a href="#/propos">v{APP_VERSION}</a>
          <br />
          {CREDIT}
          <br />
          {version ? `rclone ${version}` : "connexion…"}
          <br />
          Les identifiants restent dans la config rclone.
        </p>
      </aside>
      <main className={explorer ? "main fill" : "main"}>
        {remoteError ? <p className="error-note">{remoteError}</p> : null}
        {hash.startsWith("#/explorateur") ? <ExplorerPage /> : null}
        {hash.startsWith("#/transfert") ? <TransferPage /> : null}
        {hash.startsWith("#/activite") ? <ActivityPage /> : null}
        {hash.startsWith("#/propos") ? <AboutPage /> : null}
        {hash.startsWith("#/nuages") || !hash.startsWith("#/") ? <CloudsPage /> : null}
      </main>
    </div>
  );
}

export function App() {
  return (
    <StoreProvider>
      <Shell />
    </StoreProvider>
  );
}
