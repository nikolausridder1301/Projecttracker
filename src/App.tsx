import { useEffect, useState } from "react";
import { HashRouter, Route, Routes } from "react-router-dom";
import { createBackend, type Backend } from "./data/backend";
import { StoreProvider } from "./data/store";
import type { Db } from "./data/types";
import { CompaniesPage, CompanyDetailPage } from "./pages/Companies";
import { LinksPage } from "./pages/Links";
import { NoteDetailPage, NotesPage } from "./pages/Notes";
import { PeoplePage, PersonDetailPage } from "./pages/People";
import { SettingsPage } from "./pages/Settings";
import { TactoPage } from "./pages/Tacto";
import { TasksPage } from "./pages/Tasks";
import { TodayPage } from "./pages/Today";
import { TrashPage } from "./pages/Trash";
import { WaitingPage } from "./pages/Waiting";
import { SK_LOGO } from "./ui/common";
import { Layout } from "./ui/Layout";
import { UiProvider } from "./ui/uiState";

const created = createBackend();

export function App() {
  if ("error" in created) return <Fatal message={created.error} />;
  return <AuthGate backend={created.backend} />;
}

type AuthState = { status: "checking" } | { status: "out" } | { status: "in"; email: string };

function AuthGate({ backend }: { backend: Backend }) {
  const [auth, setAuth] = useState<AuthState>({ status: "checking" });

  useEffect(() => {
    void backend.getUserEmail().then((email) => setAuth(email ? { status: "in", email } : { status: "out" }));
    return backend.onAuthChange((email) => setAuth(email ? { status: "in", email } : { status: "out" }));
  }, [backend]);

  if (auth.status === "checking") return <Splash text="Lädt…" />;
  if (auth.status === "out") return <Login backend={backend} />;
  return <DataGate key={auth.email} backend={backend} email={auth.email} />;
}

function DataGate({ backend, email }: { backend: Backend; email: string }) {
  const [db, setDb] = useState<Db | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    setError(null);
    backend.loadAll().then(setDb, (e: Error) => setError(e.message));
  };
  useEffect(load, [backend]);

  if (error)
    return (
      <Splash text={`Daten konnten nicht geladen werden: ${error}`}>
        <button className="btn primary" onClick={load}>
          Erneut versuchen
        </button>
      </Splash>
    );
  if (!db) return <Splash text="Daten werden geladen…" />;

  return (
    <StoreProvider backend={backend} initial={db}>
      <UiProvider>
        <HashRouter>
          <Routes>
            <Route element={<Layout email={email} onSignOut={() => void backend.signOut()} />}>
              <Route index element={<TodayPage />} />
              <Route path="aufgaben" element={<TasksPage />} />
              <Route path="wartet" element={<WaitingPage />} />
              <Route path="notizen" element={<NotesPage />} />
              <Route path="notizen/:id" element={<NoteDetailPage />} />
              <Route path="tacto" element={<TactoPage />} />
              <Route path="links" element={<LinksPage />} />
              <Route path="personen" element={<PeoplePage />} />
              <Route path="personen/:id" element={<PersonDetailPage />} />
              <Route path="firmen" element={<CompaniesPage />} />
              <Route path="firmen/:id" element={<CompanyDetailPage />} />
              <Route path="papierkorb" element={<TrashPage />} />
              <Route path="einstellungen" element={<SettingsPage />} />
              <Route path="*" element={<TodayPage />} />
            </Route>
          </Routes>
        </HashRouter>
      </UiProvider>
    </StoreProvider>
  );
}

function Login({ backend }: { backend: Backend }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <div className="splash">
      <form
        className="card login"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            await backend.signIn(email.trim(), password);
          } catch (err) {
            setError((err as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <img src={SK_LOGO} alt="SK Group" width={48} height={48} />
        <h1>Projecttracker</h1>
        <input type="email" autoComplete="username" placeholder="E-Mail" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          autoComplete="current-password"
          placeholder="Passwort"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required={backend.kind === "supabase"}
        />
        {error && <div className="error-text">{error}</div>}
        <button className="btn primary" type="submit" disabled={busy}>
          {busy ? "Anmelden…" : "Anmelden"}
        </button>
      </form>
    </div>
  );
}

function Splash({ text, children }: { text: string; children?: React.ReactNode }) {
  return (
    <div className="splash">
      <div className="card login">
        <img src={SK_LOGO} alt="" width={48} height={48} />
        <p>{text}</p>
        {children}
      </div>
    </div>
  );
}

function Fatal({ message }: { message: string }) {
  return <Splash text={message} />;
}
