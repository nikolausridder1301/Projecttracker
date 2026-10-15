# Projecttracker – Spezifikation

**Stand:** 15.10.2026
**Repository:** github.com/nikolausridder1301/Projecttracker
**Status:** Entwurf nach Anforderungsklärung mit Nikolaus – zur Freigabe

---

## 1. Ziel

Ein persönliches Projektleiter-Cockpit für den Tacto-Rollout über die Gesellschaften der SK Group. Nikolaus soll sich trotz vieler paralleler Themen in Sekunden zurechtfinden:

- **Eigene Aufgaben** planen und abarbeiten.
- **Delegierte Aufgaben** an Personen der Gesellschaften nachhalten (wer, bis wann, wann zuletzt nachgehakt).
- **Notizen, Meeting-Protokolle und Entscheidungen** festhalten und wiederfinden.
- **Links** zu Dokumenten (SharePoint/Teams/Web) zentral sammeln.
- **Gesamtlage** je Gesellschaft auf einen Blick sehen (Ampel).

Die Leitfrage für jede Design-Entscheidung: *Was muss ich heute tun, wem muss ich hinterherlaufen, wo brennt es?*

## 2. Nutzer

- **Einziger Nutzer:** Nikolaus (Projektleiter). Kein Mehrbenutzerbetrieb, keine Rollen.
- Delegierte Personen arbeiten **nicht** im Tool; Nikolaus pflegt ihren Stand selbst. Das ist bewusst so gewollt, nicht eine fehlende Ausbaustufe.

## 3. Einschränkungen und Rahmenbedingungen

| Thema | Entscheidung |
|---|---|
| Hosting Frontend | GitHub Pages, Repo wird **öffentlich** geschaltet (kostenlos). Im Code stehen keine Geheimnisse und keine Projektdaten. |
| Datenhaltung | Supabase (Postgres), Projekt in der **EU-Region (Frankfurt)**, kostenloser Plan. |
| Zugriffsschutz | Supabase Auth (E-Mail + Passwort), **Registrierung deaktiviert**, genau ein Account. **Row Level Security** auf allen Tabellen: ohne Login keine Daten. Kein Client-seitiger „Passwort-Hash“-Schutz wie bei tacto – der würde bei Datenbankzugriff nichts schützen. |
| Dokumente | **Keine Dateiuploads.** Dokumente bleiben im SharePoint, im Tool liegen nur Links. |
| Firmen & Logos | Die 6 Gesellschaften + SK Group (Holding = „Übergreifend“) werden mit Logos aus dem öffentlichen Repo `tacto` übernommen; Logos liegen im Code. |
| Technik | React + TypeScript + Vite, Build und Deploy per GitHub Actions. Supabase JS Client direkt aus dem Browser (anon key ist öffentlich by design). |
| Geräte | Desktop-first (Laptop, Edge/Chrome). Handy: Grundfunktionen (siehe 6.8). |
| Verbindung | Online-only. Kein Offline-Bearbeiten. |
| Sprache | Oberfläche komplett Deutsch, Datumsformat `TT.MM.JJJJ`, Woche beginnt Montag. |
| Kosten | 0 € laufend (GitHub Free, Supabase Free). |
| Lokale Entwicklung | Projektpfad enthält `&` („Schmidt, Kranz & Co. GmbH“) → `.npmrc` mit `script-shell` auf Git Bash, wie in tacto. |

### Bewusst nicht in Version 1

Mehrbenutzer/Delegierte mit Zugang · Dateiuploads · E-Mail-/Push-Erinnerungen · Kalender-Export · Offline-Modus · echte Unteraufgaben · Import-Funktion in der App · Dark Mode · Meilensteine/Phasen/Go-live-Termine je Firma · Verknüpfung zu tacto-Daten.

## 4. Stammdaten (Startbelegung)

### 4.1 Firmen

| Kürzel | Name | Logo (aus tacto) |
|---|---|---|
| SK | SK Group (Holding) – gilt als **„Übergreifend“** | `sk.jpg` |
| HAZ | HAZEMAG | `hazemag.jpg` |
| ALM | Allmineral | `allmineral.png` |
| MAX | Maximator | `maximator.png` |
| MXH | Maximator Hydrogen | `maximator-hydrogen.jpg` |
| FEST | FEST | `fest.jpg` |
| PER | Perforator | `perforator.png` |

Je Firma zusätzlich: Farbe (für Badges), Ampel (Grün/Gelb/Rot) + Ampelkommentar + „Ampel geändert am“. Kürzel und Farben sind in den Einstellungen änderbar; neue Firmen anlegbar (ohne Logo → Kürzel-Badge).

### 4.2 Themen

Aus tacto: Datentransfer: lesen · Datentransfer: schreiben · Warengruppen · Analytics · Einsparungen (Hinweise) · RFQs · Agenten · Lieferantenabfragen · Lieferantenbewertungen · Auftragsbestätigung.
Zusätzlich: Projektmanagement/Allgemein · Schulung/Academy · Stammdaten.
In den Einstellungen anleg-, umbenenn-, sortier- und archivierbar.

### 4.3 Link-Kategorien

Konzept · Vertrag/Angebot · Schulung · Technik · Protokoll · Sonstiges (änderbar).

### 4.4 Was Nikolaus vor dem Start bereitstellen muss

1. **Supabase-Account** anlegen und ein Projekt in Region *Frankfurt (eu-central-1)* erstellen – Schritt-für-Schritt-Anleitung liefert die Umsetzung (`ANLEITUNG.md`).
2. Im Supabase-Dashboard den **eigenen Login-User** anlegen (E-Mail + Passwort). Das Passwort gibt Nikolaus selbst ein, nie im Chat.
3. **Repo auf öffentlich** stellen und GitHub Pages (Quelle: GitHub Actions) aktivieren.
4. Projekt-URL und anon key als GitHub-Repository-Variablen hinterlegen (Anleitung).
5. Optional zum Start: **Personenliste** (Name, Firma, Rolle, E-Mail) – kann aber auch direkt in der App gepflegt werden.

## 5. Datenmodell

Alle Tabellen: `id uuid`, `created_at`, `updated_at`, `deleted_at` (Papierkorb, `null` = aktiv). RLS-Policy: nur `authenticated` darf lesen/schreiben.

**companies** – `name`, `short`, `color`, `logo_key`, `is_overarching bool`, `traffic_light (green|yellow|red)`, `traffic_comment`, `traffic_changed_at`, `sort`.

**topics** – `name`, `sort`, `archived bool`.

**people** – `name`, `company_id`, `role`, `email`, `phone?`, `active bool`. Personen mit offenen Aufgaben können nicht gelöscht, nur auf inaktiv gesetzt werden.

**tasks**
- `title` (Pflicht), `description` (Markdown)
- `company_id` (Pflicht, Default aus Kontext, sonst SK/Übergreifend), `topic_id?`
- `assignee_person_id?` – `null` = **„Ich“**, sonst Delegation
- `status`: `open | in_progress | blocked | done`; `blocked_reason` (Pflicht bei `blocked`)
- `priority`: `high | medium | low` (Default `medium`)
- `due_date?`, `follow_up_date?` (nur bei Delegation sinnvoll), `done_at?`
- `checklist jsonb` – Liste `{text, done}`
- `group_id?` – verbindet Kopien aus „Für mehrere Firmen anlegen“
- `source_note_id?` – Protokoll, aus dem die Aufgabe entstand

**task_followups** – `task_id`, `date`, `note?`. Ein Eintrag pro „Nachgehakt“.

**notes** – `title`, `body` (Markdown), `kind`: `note | meeting | decision`, `company_id`, `topic_id?`, `meeting_date?`, `participants` (Personen-IDs + Freitext).

**links** – `title`, `url`, `company_id`, `topic_id?`, `category`, `description?`.

**attachments** – `link_id` + genau eines von `task_id` / `note_id`. (Links lassen sich an Aufgaben und Notizen hängen.)

**app_meta** – `last_export_at`.

**RPC `ping()`** – gibt `1` zurück, für `anon` erlaubt, liest keine Daten (Keep-alive, siehe 7.3).

## 6. Funktionen und Oberfläche

### 6.1 Layout

Look wie tacto (helle Flächen, Akzent `#2563c9`, Ampelfarben als Soft-Badges, Inter, Karten mit 16 px Radius). Linke Seitenleiste:

**Heute** · **Aufgaben** · **Wartet auf…** · **Notizen** · **Links** · **Personen** · **Firmen** · *(unten)* Papierkorb · Einstellungen · Export · Abmelden.

Oben: SK-Logo, globale Suche, „+ Neu“-Button. Firmen erscheinen überall als Badge (Logo klein bzw. Kürzel in Firmenfarbe).

### 6.2 Startseite „Heute“

1. **Ampelleiste:** 7 Firmen nebeneinander (Logo, Ampel, Kommentar als Tooltip). Klick → Firmenseite. Ampel direkt per Klick änderbar.
2. **Meine Fälligen:** Aufgaben mit Verantwortlich = Ich und `status ≠ done`, gruppiert *Überfällig* / *Heute* / *Diese Woche*.
3. **Heute nachhaken:** delegierte, nicht erledigte Aufgaben mit `follow_up_date ≤ heute` (oder Fälligkeit überschritten), sortiert nach Dringlichkeit.
4. **Blockiert:** alle blockierten Aufgaben mit Grund.

Sind 2–4 leer: Hinweis „Alles erledigt für heute.“ Browser-Tab-Titel zeigt Anzahl der Punkte in 2+3, z. B. `(5) Projecttracker`.

### 6.3 Aufgaben

- Listenansicht (Tabelle) mit Filtern: Firma, Thema, Verantwortlich (Ich / Person / alle Delegierten), Status, Priorität, Fälligkeit; Gruppierung wahlweise nach Firma, Thema, Person, Status. Filter bleiben pro Ansicht gemerkt (localStorage).
- Erledigte standardmäßig ausgeblendet (Schalter „Erledigte zeigen“), aber durchsuchbar.
- Abhaken direkt in der Liste. Statuswechsel auf *Blockiert* öffnet Pflichtfeld „Grund“.
- Detailansicht als Seitenpanel: alle Felder, Checkliste mit Fortschritt (3/7), Nachhak-Verlauf, angehängte Links, Herkunfts-Protokoll.
- **„Für mehrere Firmen anlegen“:** Mehrfachauswahl Firmen → je Firma eine eigene Aufgabe mit gemeinsamer `group_id`. In Liste und Detail sichtbar als Gruppe mit Fortschritt („5/7 erledigt“, fehlende Firmen benannt).

### 6.4 Wartet auf…

Alle delegierten offenen Aufgaben, gruppiert nach Person (mit Firma). Je Aufgabe: Fälligkeit, nächstes Nachhak-Datum, Anzahl bisheriger Nachfragen, letzte Notiz.

- **„Nachgehakt“:** speichert Datum + optionale Notiz im Verlauf und schlägt neues Nachhak-Datum **+3 Werktage** vor (Mo–Fr, Feiertage nicht berücksichtigt), änderbar.
- **Mail-Button:** öffnet `mailto:` an die Person mit Betreff `Nachfrage: <Titel>` und kurzem Text (Titel, Fälligkeit, Beschreibung).

### 6.5 Schnellerfassung

Tastenkürzel **N** (außerhalb von Eingabefeldern) oder „+ Neu“ öffnet ein schwebendes Feld. Typ wählbar (Aufgabe Default / Notiz / Link). Titel tippen + Enter = gespeichert. Firma und Thema werden aus der aktuellen Ansicht übernommen (z. B. Firmenseite HAZEMAG); weitere Felder (Verantwortlich, Fällig, Priorität) optional ausklappbar. Kein weiteres Pflichtfeld.

### 6.6 Notizen

- Arten: **Notiz**, **Meeting-Protokoll** (Datum, Teilnehmer), **Entscheidung**. Filter nach Art, Firma, Thema; Volltextsuche.
- Markdown-Editor mit Vorschau (Überschriften, Listen, Fett, Links, Checkboxen).
- Im Protokoll: Text markieren oder Button „Aufgabe daraus“ → Schnellerfassung vorbelegt mit Firma/Thema und `source_note_id`. Die Notiz zeigt ihre daraus entstandenen Aufgaben inkl. Status.

### 6.7 Links, Personen, Firmen

- **Links:** Sammlung mit Filtern (Firma, Thema, Kategorie), Öffnen in neuem Tab, Anhängen an Aufgaben/Notizen. URL-Validierung (nur `http(s)`).
- **Personen:** Liste mit Firma, Rolle, E-Mail; Detail zeigt alle an sie delegierten Aufgaben und Teilnahmen an Protokollen.
- **Firmenseite:** Logo, Ampel + Kommentar, Ansprechpartner, dann Tabs *Aufgaben* / *Notizen* / *Links* – jeweils vorgefiltert. Neue Einträge von hier übernehmen die Firma automatisch.

### 6.8 Mobil (< 768 px)

Seitenleiste wird Menü. Voll nutzbar: Heute-Ansicht, Abhaken, Schnellerfassung, Nachgehakt. Übrige Ansichten lesbar, Bearbeitung darf eingeschränkt komfortabel sein.

### 6.9 Globale Suche

**Strg+K** öffnet Suche über Aufgaben, Notizen, Links, Personen (Titel + Inhalt), Ergebnisse gruppiert nach Typ, inkl. erledigter Aufgaben, Navigation per Tastatur.

### 6.10 Löschen

Löschen setzt `deleted_at` → Eintrag im **Papierkorb**, von dort wiederherstellbar oder endgültig löschbar (mit Bestätigung). Direkt nach dem Löschen 5 Sekunden „Rückgängig“-Hinweis. Gelöschte Einträge erscheinen nirgends sonst (auch nicht in Suche/Zählern).

### 6.11 Export / Backup

Button **„Export als JSON“** lädt alle Tabellen (inkl. Papierkorb) als eine Datei `projecttracker-backup-JJJJ-MM-TT.json` herunter und setzt `last_export_at`. Ist der letzte Export älter als 14 Tage, zeigt die App einen dezenten Hinweis-Banner. (Ein Wiederherstellen aus der Datei ist nicht Teil von V1; im Notfall per Skript.)

## 7. Technik und Betrieb

### 7.1 Aufbau

- `src/` React + TypeScript, Routing per Hash-Router (GitHub Pages ohne Server-Rewrites).
- Datenzugriff gekapselt in einer Schicht (`src/data/`), Typen aus dem DB-Schema.
- `supabase/migrations/` – SQL für Tabellen, RLS-Policies, Seed (Firmen, Themen, Kategorien), `ping()`.
- Tests mit Vitest für Logik (Fälligkeits-Gruppierung, Werktage-Rechnung, Filter, Gruppenfortschritt).

### 7.2 Deployment

GitHub Action bei Push auf `main`: install → test → build → Deploy auf Pages. Supabase-URL und anon key als Repository-Variablen, zur Build-Zeit injiziert.

### 7.3 Keep-alive

Geplante GitHub Action (alle 3 Tage) ruft `ping()` mit dem anon key auf, damit das kostenlose Supabase-Projekt nicht nach 7 Tagen Inaktivität pausiert. Kein Datenzugriff.

### 7.4 Sitzung & Fehler

- Login-Maske beim ersten Aufruf; Sitzung bleibt bestehen (Refresh-Token), Abmelden manuell.
- Verbindungsverlust → fester Banner „Offline – Änderungen werden nicht gespeichert“. Offene Eingaben (Schnellerfassung, Notiz-Editor) werden lokal als Entwurf gesichert und nach Neuladen angeboten.
- Fehlgeschlagenes Speichern wird sichtbar gemeldet; nichts geht „still“ verloren.

## 8. Risiken und Tradeoffs

| Risiko | Umgang |
|---|---|
| Firmendaten in externer Cloud | EU-Region, keine Dateien, echte Auth + RLS. Nikolaus verantwortet die Freigabe intern. |
| Supabase Free pausiert / keine Backups | Keep-alive-Action, JSON-Export mit 14-Tage-Erinnerung. Upgrade auf Pro (~25 $/Monat) jederzeit möglich. |
| RLS falsch konfiguriert → Daten offen | Akzeptanztest mit anon key (siehe 9); Policies als Migration versioniert. |
| Pflegeaufwand zu hoch → Tool wird nicht genutzt | Minimale Pflichtfelder, Schnellerfassung, Kontext-Defaults. |
| Öffentlicher Code | Enthält nur Logos/Firmennamen (bereits über tacto öffentlich), keine Daten. |
| Online-only | Bewusster Verzicht; Entwurfsschutz verhindert Datenverlust beim Tippen. |
| Single-User-Annahme | Delegierte bekommen keinen Zugang; spätere Öffnung erfordert Umbau von RLS und Auth. |

## 9. Akzeptanzkriterien

**Sicherheit**
- [ ] Aufruf der Seite ohne Login zeigt nur die Login-Maske.
- [ ] Ein direkter REST-Aufruf mit dem anon key auf jede Tabelle liefert **keine** Datensätze und kann nichts schreiben.
- [ ] Selbstregistrierung ist deaktiviert (Signup-Versuch schlägt fehl).
- [ ] Im Repo und im Build stehen keine Secrets außer URL + anon key.

**Heute & Navigation**
- [ ] Nach Login erscheint „Heute“ mit Ampelleiste (7 Firmen mit Logo) und den drei Blöcken; Überfälliges ist optisch hervorgehoben.
- [ ] Eine delegierte Aufgabe mit Nachhak-Datum heute erscheint unter „Heute nachhaken“, nicht unter „Meine Fälligen“.
- [ ] Tab-Titel zeigt die korrekte Anzahl offener Heute-Punkte.
- [ ] Jede Ansicht ist von der Seitenleiste mit einem Klick erreichbar; Strg+K findet einen Eintrag per Titelteil in < 1 s bei 2.000 Einträgen.

**Aufgaben & Delegation**
- [ ] Schnellerfassung: N → Titel → Enter legt eine Aufgabe an; auf der Firmenseite HAZEMAG ist die Firma automatisch HAZEMAG, sonst SK/Übergreifend.
- [ ] Status „Blockiert“ ist ohne Grund nicht speicherbar.
- [ ] „Für mehrere Firmen anlegen“ mit 6 Firmen erzeugt 6 Aufgaben; nach Erledigen von 2 zeigt die Gruppe „2/6“ und nennt die offenen Firmen.
- [ ] „Nachgehakt“ an einem Donnerstag schlägt den folgenden Dienstag vor und erhöht den Nachfragezähler.
- [ ] Mail-Button öffnet das Mailprogramm mit Empfänger, Betreff und Text.
- [ ] Checkliste zeigt Fortschritt (x/y) in Liste und Detail.
- [ ] Erledigte Aufgaben verschwinden aus Standardansichten, sind über Suche und Filter „Erledigte zeigen“ auffindbar.

**Notizen & Links**
- [ ] Notiz-Arten sind filterbar; „Entscheidungen von Firma X zu Thema Y“ ist mit zwei Filtern auffindbar.
- [ ] Aus einem Protokoll angelegte Aufgabe zeigt das Protokoll als Herkunft, das Protokoll listet die Aufgabe mit Status.
- [ ] Ein Link lässt sich an eine Aufgabe und an eine Notiz hängen und erscheint zusätzlich in der Link-Sammlung.
- [ ] Ungültige URLs (ohne `http(s)://`) werden abgelehnt.

**Stammdaten**
- [ ] Startbelegung: 7 Firmen mit Logos, 13 Themen, 6 Link-Kategorien vorhanden.
- [ ] Person mit offenen Aufgaben kann nicht gelöscht, nur inaktiv gesetzt werden; inaktive Personen sind bei Neuanlage nicht mehr auswählbar, bestehende Zuordnungen bleiben sichtbar.
- [ ] Ampel einer Firma ist von „Heute“ und der Firmenseite änderbar, Änderungsdatum wird gespeichert.

**Löschen & Backup**
- [ ] Gelöschter Eintrag ist per „Rückgängig“ (5 s) und aus dem Papierkorb wiederherstellbar; endgültiges Löschen nur mit Bestätigung.
- [ ] JSON-Export enthält alle Tabellen; nach 14 Tagen ohne Export erscheint der Hinweis.

**Betrieb**
- [ ] Push auf `main` baut, testet und veröffentlicht automatisch auf GitHub Pages.
- [ ] Keep-alive-Action läuft planmäßig erfolgreich.
- [ ] Bei getrennter Verbindung erscheint der Offline-Banner; ein angefangener Schnellerfassungs-Text ist nach Neuladen als Entwurf verfügbar.
- [ ] Auf 375 px Breite sind Heute, Abhaken, Schnellerfassung und Nachgehakt ohne horizontales Scrollen nutzbar.

## 10. Offene Punkte

- Interne Freigabe zur Speicherung von Projektnotizen und Kontaktdaten bei Supabase (EU) – liegt bei Nikolaus.
- Personenliste zum Start (optional, siehe 4.4).
