# Projecttracker – Spezifikation

**Stand:** 15.10.2026 (überarbeitet nach Umsetzung und Feedback-Runden)
**Repository:** github.com/nikolausridder1301/Projecttracker
**Live:** https://nikolausridder1301.github.io/Projecttracker/
**Status:** Umgesetzt und live; diese Fassung beschreibt den aktuellen Stand inklusive aller seither getroffenen Entscheidungen (siehe Abschnitt 11).

---

## 1. Ziel

Ein persönliches Projektleiter-Cockpit für Rollouts in der SK Group – zuerst Tacto, künftig weitere Projekte mit derselben Struktur. Nikolaus soll sich trotz vieler paralleler Themen in Sekunden zurechtfinden:

- **Eigene Aufgaben** planen und abarbeiten.
- **Delegierte Aufgaben** nachhalten: wer, bis wann, wann zuletzt nachgefragt, was gesagt wurde.
- **Fortschritt je Gesellschaft** über Meilensteine sehen und die Firmen-Ampel bewusst setzen.
- **Meetings vorbereiten:** alles Relevante zu einer Person oder Firma auf einen Blick.
- **Notizen, Protokolle, Entscheidungen** festhalten; **Links** zu Dokumenten sammeln.
- **Anbieter-Themen** (bei Tacto: Feature Requests, Fragen, Bugs, Best Practices, Fails & Claims) mit Status verfolgen.

Leitfrage für jede Design-Entscheidung: *Was muss ich heute tun, wem muss ich hinterherlaufen, wo brennt es?* Leitprinzip seit den Feedback-Runden: **so einfach wie möglich** – nur zeigen, was gebraucht wird; Nebensächliches eingeklappt oder weggelassen.

## 2. Nutzer

- **Einziger Nutzer:** Nikolaus (Projektleiter). Kein Mehrbenutzerbetrieb, keine Rollen.
- Delegierte Personen arbeiten **nicht** im Tool; Nikolaus pflegt ihren Stand selbst. Das ist bewusst so gewollt.

## 3. Rahmenbedingungen

| Thema | Entscheidung |
|---|---|
| Hosting | GitHub Pages, Repo **öffentlich** (kostenlos). Im Code stehen keine Geheimnisse und keine Projektdaten. |
| Datenhaltung | Supabase (Postgres), Projekt `projecttracker` in der **EU-Region Frankfurt**, kostenloser Plan. |
| Zugriffsschutz | Supabase Auth (E-Mail + Passwort), **Registrierung deaktiviert**. Row Level Security auf allen Tabellen, zusätzlich **Freigabeliste** `allowed_users`: nur freigeschaltete Konten sehen Daten – auch wenn die Registrierung versehentlich an wäre. Ein Passwortschutz nur im Frontend wurde verworfen (schützt die Datenbank nicht). |
| Login | Bleibt bestehen (Wunsch, ihn während der Testphase zu entfernen, wurde verworfen). Sitzung bleibt pro Browser erhalten. |
| Dokumente | **Keine Dateiuploads.** Dokumente bleiben im SharePoint, im Tool nur Links. Ausnahme: Firmenlogos liegen im Code. |
| Technik | React + TypeScript + Vite; Icons von Lucide; Drag-and-Drop mit dnd-kit; Supabase JS direkt im Browser (publishable key ist öffentlich by design). |
| Geräte | Desktop-first; Handy für die wichtigsten Abläufe (siehe 6.15). |
| Verbindung | Online-only. Kein Offline-Bearbeiten; Entwürfe bleiben lokal erhalten. |
| Aktualisierung | Keine Live-Synchronisierung zwischen Geräten – Änderungen auf einem anderen Gerät erscheinen nach Neuladen. |
| Sprache | Oberfläche komplett Deutsch, Datumsformat `TT.MM.JJJJ`, Woche beginnt Montag. |
| Kosten | 0 € laufend (GitHub Free, Supabase Free). |
| Lokale Entwicklung | Projektpfad enthält `&` → lokale `.npmrc` mit `script-shell` auf Git Bash. Ohne `.env` startet die App im Demo-Modus mit Beispieldaten. |

### Bewusst nicht vorgesehen

Mehrbenutzer/Zugang für Delegierte · Dateiuploads · E-Mail-/Push-Erinnerungen · Kalender-Export · Offline-Modus · echte Unteraufgaben (stattdessen Checkliste) · Import-Funktion · Dark Mode · Markdown-Darstellung · **Themen-Zuordnung an Aufgaben, Notizen, Links und Anbieter-Punkten** (Themen sind nur noch Meilensteine) · **neue Beschreibungen und Link-Anhänge an Aufgaben** · Verknüpfung zu tacto-/ERP-Daten.

## 4. Struktur und Stammdaten

### 4.1 Projekte

- Oben links **Projekt-Umschalter**: aktuelles Projekt (Kürzel-Badge in Projektfarbe + Name), Liste aller Projekte, „Neues Projekt…“, „Projekteinstellungen“.
- **Alles gehört zu einem Projekt** – auch Firmen und Personen. Ein neues Projekt kann Firmen, Personen, Meilensteine und Link-Kategorien eines bestehenden Projekts **als Kopie** übernehmen (Ampeln starten neutral); Aufgaben, Notizen, Links und Anbieter-Punkte werden nicht kopiert. Danach ist jedes Projekt unabhängig anpassbar.
- Projekte lassen sich archivieren; das letzte aktive Projekt nicht.
- Erstes Projekt: **„Tacto“** (Kürzel TAC) mit allen bisherigen Daten.

### 4.2 Firmen (Projekt „Tacto“)

| Kürzel | Name | Rolle |
|---|---|---|
| SK | SK Group (Übergreifend) | Holding, „übergreifend“ |
| HAZ | HAZEMAG | Gesellschaft |
| ALM | Allmineral | Gesellschaft |
| MAX | Maximator | Gesellschaft |
| MXH | Maximator Hydrogen | Gesellschaft |
| FEST | FEST | Gesellschaft |
| PER | Perforator | Gesellschaft |
| TAC | Tacto | **externer Partner** (Software-Anbieter) |

Logos aus dem Repo `tacto`, Tacto-Logo von Nikolaus. Externe Partner zählen nicht zu „Alle Gesellschaften“ und erscheinen nicht in der Fortschritts-Matrix. Je Firma: Farbe, Kürzel, Ampel mit Begründung und Verlauf.

### 4.3 Meilensteine (früher „Themen“)

Die 13 Startthemen (10 tacto-Module plus Projektmanagement/Allgemein, Schulung/Academy, Stammdaten) sind jetzt **Meilensteine**: die Zeilen der Fortschritts-Matrix. In den Einstellungen umbenenn-, sortier-, ergänz- und archivierbar.

### 4.4 Personen

Je Projekt, mit Firma, Rolle, E-Mail, Telefon. Angelegt: 10 Kontakte der Gesellschaften sowie Julius Reinboth (Customer Value Manager) und Arman Gall (Solution Engineer) bei Tacto. Personen mit offenen Aufgaben lassen sich nicht löschen, nur inaktiv setzen.

### 4.5 Link-Kategorien

Konzept · Vertrag/Angebot · Schulung · Technik · Protokoll · Sonstiges (änderbar).

## 5. Datenmodell

Alle Tabellen: `id`, `created_at`, `updated_at`, `deleted_at` (Papierkorb). Projektbezogene Tabellen tragen `project_id`. RLS: nur freigeschaltete Konten (`private.is_allowed()`).

| Tabelle | Inhalt |
|---|---|
| `projects` | Name, Kürzel, Farbe, `vendor_company_id` (Anbieter-Bereich an/aus), Sortierung, archiviert |
| `companies` | Name, Kürzel, Farbe, Logo-Schlüssel, übergreifend, **extern**, Ampel + Begründung + Zeitpunkt |
| `traffic_history` | Ampel-Verlauf: Firma, von, nach, Begründung |
| `topics` | **Meilensteine** (Name, Sortierung, archiviert) |
| `milestone_status` | Stand je Meilenstein und Firma: Status, Zieldatum, Kommentar (eindeutig je Paar) |
| `people` | Personen je Projekt |
| `tasks` | Titel, Firma, Verantwortlich (`null` = ich), Status, Grund bei „Blockiert“, Priorität, fällig, nächstes Nachhaken, Checkliste, Gruppe (Mehrfirmen), Herkunfts-Protokoll; Beschreibung nur noch für Altbestand |
| `task_followups` | Nachfragen: Datum, Notiz |
| `notes` | Notiz / Meeting-Protokoll / Entscheidung, Firma, Datum, Teilnehmer, Text |
| `links`, `link_categories`, `attachments` | Link-Sammlung; Anhänge an Notizen (an Aufgaben nur Altbestand) |
| `vendor_items` | Anbieter-Punkte: Kategorie, Status, betroffene Firmen (leer = alle), Priorität, Ansprechpartner, Ticket, Antwort, Versprochen/Tatsächlich/Beleg, Meldedatum |
| `app_meta` | letzter Export, **Menü-Reihenfolge** (`nav_order`) |
| `allowed_users` | Freigabeliste (keine API-Rechte) |

Die Spalten `topic_id` an Aufgaben, Notizen, Links und Anbieter-Punkten bestehen noch, werden aber nicht mehr angezeigt oder gesetzt. Migrationen: `001`/`002` für Neuinstallationen, `005`–`010` für die schrittweise Erweiterung.

## 6. Funktionen und Oberfläche

### 6.1 Design-Grundsätze

- Eine Schrift (Inter), feste Größenskala (12/13/14/16/20/24 px), Icons statt Emojis.
- **Nichts springt:** Aktiv/Hover ändern nur Farben, nie Schriftstärke oder Größe.
- **Chips statt beschrifteter Felder:** Eigenschaften als kleine Pillen; leere Werte blass. Klick öffnet eine **eigene Auswahlliste im App-Design** (Haken an der Auswahl, Tastatur, Suche ab 9 Einträgen) statt des Browser-Menüs.
- Nebensächliches eingeklappt (Checkliste, Verlauf); leere Bereiche ausgeblendet.

### 6.2 Navigation

Seitenleiste (Reihenfolge per **Drag-and-Drop** änderbar, gilt für alle Projekte und Geräte; zurücksetzbar in den Einstellungen):
**Heute · Fortschritt · Aufgaben · Delegiert · Meeting · Notizen · {Anbieter, z. B. Tacto} · Links · Personen · Firmen** – unten Papierkorb, Einstellungen, Abmelden.
Kopfzeile: globale Suche (Strg+K), Backup-Icon, „+ Neu“ (Taste N).

### 6.3 Heute

1. **Ampelleiste** der Firmen – **nur Anzeige**: Logo, Kürzel, ein Punkt, „seit …“, farbiger Rand bei Gelb/Rot. Klick öffnet den Ampel-Dialog (6.10).
2. **Meine Fälligen** (überfällig / heute / diese Woche), **Heute nachhaken**, **Blockiert** – leere Bereiche entfallen; sind alle leer, erscheint eine schlichte Zeile „Alles erledigt für heute“.
3. Bei mehreren Projekten: Umschalter **„Dieses Projekt | Alle Projekte“**; in der Gesamtansicht trägt jede Aufgabe ihr Projekt-Kürzel, ein Klick wechselt ins Projekt.
4. Tab-Titel und Menü-Zähler zeigen die Anzahl offener Heute-Punkte.

### 6.4 Fortschritt (Meilensteine)

- **Matrix:** Meilensteine (Zeilen) × Gesellschaften (Spalten, ohne externe Partner).
- **Zelle:** Status *Nicht gestartet · Läuft · Kritisch · Verzögert · Abgeschlossen · Nicht relevant*, optional Zieldatum und Kommentar; Klick öffnet einen Dialog.
- Überschrittenes Zieldatum → Zelle rot umrandet, Hinweis mit Anzahl oben.
- Spaltenkopf: Fortschritt je Firma (abgeschlossen von relevant).
- Auf der Firmenseite dieselben Meilensteine als Liste.

### 6.5 Aufgaben

- Liste mit Schnellfilter **Alle | Meine | Delegiert**, Firma und „Filter“-Knopf (Person, Status, Priorität, Fälligkeit, Gruppierung nach Firma/Person/Status, Erledigte zeigen).
- **Erledigte getrennt:** offene oben (gruppiert), darunter Trennlinie „Erledigt“ und die erledigten Aufgaben nach Erledigt-Datum, neueste zuerst.
- **Detail-Panel:** Titel, Chips **Status · Firma · Verantwortlich · Fällig · Priorität**; „Blockiert“ nur mit Grund; Delegations-Box (6.6); Checkliste (eingeklappt, bis Punkte existieren).
- **Keine neuen Beschreibungen und Link-Anhänge** mehr – vorhandene werden weiter angezeigt.
- **„Für mehrere Firmen anlegen“** erzeugt je Firma eine Aufgabe als Gruppe („2/6 Firmen“); „Alle Gesellschaften“ ohne Holding und externe Partner.
- Löschen mit „Rückgängig“ und Papierkorb.

### 6.6 Delegiert und Nachhaken

- Menüpunkt **„Delegiert“** (früher „Wartet auf…“): offene Delegationen nach Person.
- **„Nachfrage notieren“**: Notiz („Was hast du gefragt oder erfahren?“), nächstes Nachhaken per Schnellwahl (in 3 Tagen · 1 Woche · 2 Wochen · keins · Datum) mit Vorschau, Option **„Damit erledigt – Aufgabe abschließen“**, Mail-Button (vorausgefülltes `mailto:`).
- **Jede Nachfrage bleibt** als eigener Eintrag; **Verlauf als Zeitleiste** im Panel, einzeln löschbar.
- Zeilen zeigen **rechts den Grund** („Frist seit 2 T. überschritten“, „Heute nachhaken“) bzw. den nächsten Termin und **darunter den Stand** („3× nachgefragt · zuletzt …“).
- Ein Nachhak-Termin erzeugt **keine eigene Aufgabe** – die delegierte Aufgabe erscheint am Stichtag unter „Heute nachhaken“.

### 6.7 Meeting-Vorbereitung

- Person oder ganze Firma wählen (Suche; letzte Auswahl bleibt), auch per „Meeting vorbereiten“ auf Personen-/Firmenseiten.
- **Briefing:** **Offen bei der Person** (mit „Nachfrage notieren“), **meine offenen Punkte**, **weitere Offene der Firma**, rechts **Anbieter-Punkte** der Firma und **letzte Notizen** – Blockiertes zuerst. Leere Bereiche entfallen; ohne rechte Inhalte nutzt die Liste die volle Breite. Kein Kopfbereich und kein „Erledigt“-Rückblick (kein Mehrwert).
- **Nichts offen:** schlichte Karte „Mit … ist gerade nichts offen“ mit Button **„Aufgabe anlegen“** (Firma vorbelegt).
- **„Protokoll starten“** legt ein Meeting-Protokoll mit Teilnehmer, Firma, Datum und Agenda-Checkliste an; **„Agenda kopieren“** in die Zwischenablage.

### 6.8 Notizen

Arten **Notiz · Meeting-Protokoll · Entscheidung**; Chips für Art, Firma, Datum; Teilnehmer bei Protokollen; Text als mitwachsendes Feld (keine Markdown-Darstellung). **„Aufgabe daraus“** übernimmt markierten Text als Aufgabe, verknüpft in beide Richtungen; Bereiche klappen auf, sobald sie Inhalt bekommen. Links lassen sich an Notizen hängen.

### 6.9 Anbieter-Bereich (bei Tacto: „Tacto“)

- Optional je Projekt (Projekteinstellungen: Anbieter-Firma oder „Aus“); Menüpunkt trägt den Anbieternamen.
- Reiter **Features · Fragen · Bugs · Best Practices · Claims** mit Zahl der offenen Punkte; Firmenfilter; Erledigte über „X erledigte anzeigen“.
- **Erfassen per Zeile** oben in der Liste (Titel + Enter, kein Platzhalter-Eintrag).
- Status je Kategorie; beim ersten Weg zum Anbieter wird das Meldedatum gesetzt („seit 23 T. bei Tacto“).
- Detail: Chips Status · Firmen (Mehrfachauswahl, leer = alle) · Priorität; Ansprechpartner und Kategorie hinter „Mehr…“; Ticketfeld erst ab Meldung; Fragen mit Antwort (setzt „Beantwortet“, „Als Best Practice übernehmen“); Claims mit Versprochen/Tatsächlich/Beleg.
- **„Für Jour fixe kopieren“**: offene Punkte nach Kategorie als Text.

### 6.10 Firmen, Ampel, Personen, Links

- **Ampel ändern nur im Dialog:** Grün/Gelb/Rot, **Begründung Pflicht bei Gelb und Rot**, jede Änderung im **Ampel-Verlauf**. Der Dialog zeigt einen **Vorschlag aus den Meilensteinen** (verzögert/überfällig → Rot, kritisch → Gelb) mit „Übernehmen“ – die Entscheidung bleibt manuell.
- **Firmenseite:** Logo, Ampel, Ansprechpartner, „Meeting vorbereiten“; Reiter Meilensteine · Aufgaben · Notizen · Links · Anbieter · Ampel-Verlauf.
- **Personen:** Liste und Detail (delegierte Aufgaben, Teilnahmen), „Meeting vorbereiten“.
- **Links:** zentrale Sammlung mit Firma und Kategorie, URL-Prüfung (nur `http(s)`).

### 6.11 Schnellerfassung

Taste **N** oder „+ Neu“: Typ (Aufgabe/Notiz/Link), Titel, Enter. Chips für Firma (aus dem Kontext vorbelegt), Mehrere Firmen, Verantwortlich, Fällig, Priorität bzw. Art/Kategorie. Entwürfe bleiben erhalten.

### 6.12 Suche

**Strg+K** über Aufgaben, Notizen, Anbieter-Punkte, Links und Personen des aktuellen Projekts.

### 6.13 Papierkorb

Gelöschtes landet im Papierkorb (je Projekt), wiederherstellbar oder endgültig löschbar; 5 Sekunden „Rückgängig“.

### 6.14 Backup und Einstellungen

- **Backup** per Download-Icon in der Kopfzeile (alle Projekte, JSON); oranger Punkt, wenn das letzte Backup älter als 14 Tage ist. Keine Banner-Leiste.
- **Einstellungen:** Projekt (Name, Kürzel, Farbe, Anbieter-Bereich, Archivieren) · Menü (Standard-Reihenfolge) · Firmen (inkl. „Partner“) · Meilensteine · Link-Kategorien · Backup.

### 6.15 Mobil

Seitenleiste als Menü; Heute, Abhaken, Schnellerfassung, Nachfrage notieren und alle Dialoge ohne seitliches Scrollen; breite Tabellen (Fortschritt) scrollen in sich.

## 7. Technik und Betrieb

- **Aufbau:** `src/data` (Typen, Backend Supabase/Demo, Store), `src/logic` (reine Logik mit Tests: Datum, Heute, Suche, Anbieter, Projekte, Menü, Ampel, Meilensteine, Briefing), `src/ui` (gemeinsame Bausteine), `src/pages` (Ansichten), `supabase/migrations`.
- **Store:** lädt alles einmal, aktualisiert optimistisch (Rücknahme bei Fehler); `db` = aktuelles Projekt, `allDb` = Gesamtbestand; `project_id` wird beim Anlegen automatisch gesetzt.
- **Ablauf für Änderungen:** Feature-Branch → Pull Request → Merge auf `main` → GitHub Action baut, testet und veröffentlicht. Datenbankänderungen als Migration; bei neuen Pflichtspalten ein Übergangs-Standardwert, damit die laufende Version bis zum Deploy weiter speichert.
- **Keep-alive:** GitHub Action alle 3 Tage ruft `ping()` auf.
- **Sitzung & Fehler:** Login bleibt bestehen; Offline-Hinweis; Fehler beim Speichern werden gemeldet.

## 8. Risiken und Tradeoffs

| Risiko | Umgang |
|---|---|
| Firmendaten in externer Cloud | EU-Region, keine Dateien, Login + RLS + Freigabeliste. Interne Freigabe verantwortet Nikolaus. |
| Supabase Free pausiert / keine Backups | Keep-alive, JSON-Backup mit Erinnerung; Upgrade jederzeit möglich. |
| Öffentlicher Code | Nur Code, Logos und Firmennamen (bereits über tacto öffentlich), keine Daten. |
| Keine Live-Synchronisierung | Bei Arbeit auf mehreren Geräten neu laden; bei Bedarf nachrüstbar. |
| Pflegeaufwand | Minimal gehaltene Felder, Schnellerfassung, Kontext-Vorbelegung, Vorschläge statt Pflichtpflege. |

## 9. Akzeptanzkriterien (Auszug, alle umgesetzt und getestet)

- Ohne Login und mit fremdem Konto sind keine Daten lesbar oder schreibbar; Registrierung ist aus.
- Projekt anlegen mit Kopie; Daten strikt je Projekt getrennt; „Alle Projekte“ auf Heute.
- Ampel ändert sich nicht per Einzelklick; Gelb/Rot nur mit Begründung; Verlauf mit von/nach.
- Fortschritts-Matrix: Zelle setzen/ändern ohne Duplikate; überschrittene Ziele markiert; Ampel-Vorschlag passend.
- Nachfragen bleiben alle im Verlauf; „Damit erledigt“ schließt ab; Grund und Stand in der Zeile.
- Meeting-Briefing zeigt nur die gewählte Person/Firma; Protokoll mit Agenda und Teilnehmer.
- Erledigte Aufgaben unter Trennlinie nach Datum.
- Menü per Ziehen sortierbar, ohne versehentlichen Seitenwechsel.
- Keine Themen-Felder außerhalb der Meilensteine; keine neuen Beschreibungen/Links an Aufgaben.
- Alle Seiten ohne seitliches Scrollen bei 375 px und 1280 px.

## 10. Offene Punkte

- Interne Freigabe zur Speicherung von Projektnotizen und Kontaktdaten bei Supabase (EU) – liegt bei Nikolaus.
- Auswahlfelder in den Filterleisten öffnen noch das Browser-Menü (Chips bereits angeglichen).
- Ziehen im Menü per Touch auf einem echten Handy noch nicht getestet; Kopieren in die Zwischenablage nur mit echtem Browser prüfbar.
- Optional: Live-Synchronisierung zwischen Geräten.

## 11. Entscheidungsprotokoll (15.10.2026)

| Thema | Entscheidung |
|---|---|
| Plattform | GitHub Pages + Supabase statt lokaler Datei |
| Zugriff | Echtes Login mit RLS und Freigabeliste; Frontend-Passwort verworfen; Login bleibt |
| Dokumente | Nur Links, keine Uploads |
| Design | Vereinfacht: Chips, eigene Auswahllisten, eine Schrift, nichts springt, leere Bereiche weg |
| Backup-Hinweis | Icon mit Punkt statt gelber Leiste |
| Tacto-Bereich | Eigener Bereich mit Status statt Notiz-Arten; Erfassungszeile, eine Filterzeile |
| Mehrere Projekte | Alles je Projekt, Kopie bei Neuanlage, Anbieter-Bereich optional |
| Menü | Sortierbar per Drag-and-Drop, gespeichert in der Datenbank |
| Nachhaken | „Nachfrage notieren“ mit Verlauf statt „Nachgehakt“; keine eigene Aufgabe |
| Ampel | Nur im Dialog mit Begründung und Verlauf; Vorschlag aus Meilensteinen |
| Erledigte | Unter Trennlinie, nach Datum |
| Meeting | Briefing zu Person/Firma mit Protokoll-Start |
| Themen | Werden Meilensteine (Fortschritts-Matrix); kein Thema-Feld mehr an Einträgen |
| Benennung | „Wartet auf…“ → „Delegiert“ |
| Aufgaben-Panel | Keine neuen Beschreibungen und Links |
| Meeting-Seite | Ohne Kopfkarte und „Erledigt“-Bereich; neuer Leer-Zustand mit „Aufgabe anlegen“ |
