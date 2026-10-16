# Projecttracker

Persönliches Projektleiter-Cockpit für den Tacto-Rollout in der SK Group: eigene Aufgaben, Delegationen mit Verlauf (datierte Updates je Aufgabe), Notizen/Protokolle/Entscheidungen, Links und Firmen-Ampeln.

- Spezifikation: [SPEC.md](SPEC.md)
- Einrichtung (Supabase, GitHub Pages): [ANLEITUNG.md](ANLEITUNG.md)
- Live: https://nikolausridder1301.github.io/Projecttracker/

## Technik

React + TypeScript + Vite, Daten in Supabase (Postgres, Auth, Row Level Security), Hosting auf GitHub Pages über GitHub Actions.

```
src/data/      Typen, Supabase-/Demo-Backend, zentraler Store
src/logic/     reine Logik (Datum, Heute-Ansicht, Suche) + Tests
src/ui/        gemeinsame Komponenten (Layout, Aufgaben-Panel, Schnellerfassung, Suche)
src/pages/     Ansichten
supabase/      SQL-Schema und Startdaten
```

## Lokal entwickeln

```bash
npm install
npm run dev
```

Ohne `.env` startet die App lokal im **Demo-Modus** mit Beispieldaten im Browser-Speicher (kein Supabase nötig). Mit echten Daten: `.env.example` nach `.env` kopieren und ausfüllen.

```bash
npm test
```

```bash
npm run build
```

**Windows-Hinweis:** Der Projektpfad enthält `&` („Schmidt, Kranz & Co. GmbH"), was `cmd.exe` bei npm-Skripten bricht. Lokal liegt deshalb eine (nicht eingecheckte) `.npmrc` mit:

```
script-shell=C:\Program Files\Git\bin\bash.exe
```
