import { APP_VERSION, CREDIT, RELEASES } from "../history";

export function AboutPage() {
  return (
    <section>
      <header className="page-head">
        <div>
          <h1>À propos</h1>
          <p className="lede">Version {APP_VERSION}. {CREDIT}</p>
        </div>
      </header>
      <ol className="history">
        {RELEASES.map((release) => (
          <li key={release.version}>
            <header>
              <strong>v{release.version}</strong>
              <span>{release.title}</span>
            </header>
            <ul>
              {release.notes.map((note) => (
                <li key={note}>{note}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
      <p className="hint credit">© 2026 PetiK. {CREDIT}</p>
    </section>
  );
}
