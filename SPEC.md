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

Mehrbenutzer/Zugang für Delegierte · Dateiuploads · E-Mail-/Push-Erinnerungen · Kalender-Export · Offline-Modus · eigene Unteraufgaben-Objekte (stattdessen „Nächste Schritte“ in der Aufgabe) · Import-Funktion · Dark Mode · Markdown-Darstellung · **Themen-Zuordnung an Aufgaben, Notizen, Links und Anbieter-Punkten** (Themen sind nur noch Meilensteine) · **neue Beschreibungen und Link-Anhänge an Aufgaben** · Verknüpfung zu tacto-/ERP-Daten.

## 4. Struktur und Stammdaten

### 4.1 Projekte

- Oben links **Projekt-Umschalter**: aktuelles Projekt (Kürzel-Badge in Projektfarbe + Name), Liste aller Projekte, „Neues Projekt…“, „Projekteinstellungen“. **Bei nur einem Projekt** steht dort schlicht der Name; „Neues Projekt…“ liegt dann in den Einstellungen.
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

Logos aus dem Repo `tacto`, Tacto-Logo von Nikolaus. Externe Partner zählen nicht zu „Alle Gesellschaften“ und haben keine Ampel-Kachel auf „Heute“. Je Firma: Farbe, Kürzel, Ampel mit Begründung und Verlauf.

### 4.3 Meilensteine (früher „Themen“)

Die 13 Startthemen (10 tacto-Module plus Projektmanagement/Allgemein, Schulung/Academy, Stammdaten) sind jetzt **Meilensteine** je Firma (Reiter in der Firmen-Ansicht, Grundlage des Ampel-Vorschlags); ausgeblendet, sobald ein Reporting-Link gesetzt ist. In den Einstellungen umbenenn-, sortier-, ergänz- und archivierbar.

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
| `tasks` | Titel, Firmen (`company_ids`, mindestens eine), Verantwortliche Personen (`assignee_person_ids`, leer = ich; mehrere möglich), Status (offen/blockiert/erledigt), Grund bei „Blockiert“, Wichtig-Fahne (`priority` high/medium), fällig, Nächste Schritte (`checklist`: Text, erledigt, optional Personen und Datum – kein eigenes Objekt), Herkunfts-Protokoll; Beschreibung nur noch für Altbestand |
| `task_followups` | Früherer **Verlauf** je Aufgabe (Datum, Text) – wird nicht mehr angezeigt oder beschrieben, Daten bleiben erhalten. Die Spalte `tasks.follow_up_date` wird nicht mehr genutzt. |
| `notes` | Notiz / Meeting-Protokoll / Entscheidung, Firmen (`company_ids`), Datum, Teilnehmer, Text |
| `links`, `link_categories`, `attachments` | Link-Sammlung mit Firmen (`company_ids`); Anhänge an Notizen (an Aufgaben nur Altbestand) |
| `vendor_items` | Anbieter-Punkte: Kategorie, Status, betroffene Firmen (leer = alle), Wichtig-Fahne, Ansprechpartner (`contact_person_ids`, mehrere), Ticket, Antwort, Versprochen/Tatsächlich/Beleg, Meldedatum |
| `app_meta` | letzter Export, **Menü-Reihenfolge** (`nav_order`) |
| `allowed_users` | Freigabeliste (keine API-Rechte) |

Die Spalten `topic_id` an Aufgaben, Notizen, Links und Anbieter-Punkten bestehen noch, werden aber nicht mehr angezeigt oder gesetzt. Migrationen: `001`/`002` für Neuinstallationen, `005`–`010` für die schrittweise Erweiterung.

## 6. Funktionen und Oberfläche

### 6.1 Design-Grundsätze

- Eine Schrift (Inter), feste Größenskala (12/13/14/16/20/24 px), Icons statt Emojis.
- **Nichts springt:** Aktiv/Hover ändern nur Farben, nie Schriftstärke oder Größe.
- **Chips statt beschrifteter Felder:** Eigenschaften als kleine Pillen; leere Werte blass. Klick öffnet eine **eigene Auswahlliste im App-Design** (Haken an der Auswahl, Tastatur, Suche ab 9 Einträgen) statt des Browser-Menüs – **überall dieselbe Liste**. **Firmen und Personen sind überall Mehrfachauswahl** (Aufgaben, Notizen, Protokolle, Entscheidungen, Links, Nächste Schritte, Teilnehmer, Tacto-Ansprechpartner); Einzelauswahl nur, wo es nur eins geben kann (Firma einer Person, Anbieter des Projekts).
- Nebensächliches eingeklappt (Nächste Schritte, solange leer); leere Bereiche ausgeblendet.

### 6.2 Navigation

Seitenleiste (Reihenfolge per **Drag-and-Drop** änderbar, gilt für alle Projekte und Geräte; zurücksetzbar in den Einstellungen):
**Heute · Reporting (externer Link) · Aufgaben · Delegiert · Meeting · Notizen · {Anbieter, z. B. Tacto} · Links · Kontakte** (Firmen & Personen) – unten Papierkorb, Einstellungen, Abmelden.
Kopfzeile: globale Suche (Strg+K), Backup-Icon, „+ Neu“ (Taste N). **Alles Neue entsteht nur über „+ Neu“** – Seiten haben keine eigenen Neu-Buttons.

### 6.3 Heute

1. **Ampelleiste** der Firmen – **nur Anzeige**: Logo, Kürzel, ein Punkt, „seit …“, farbiger Rand bei Gelb/Rot. Klick öffnet den Ampel-Dialog (6.10).
2. **Fällig** (überfällig / heute / diese Woche – eigene und delegierte) und **Blockiert** – leere Bereiche entfallen; sind alle leer, erscheint eine schlichte Zeile „Alles erledigt für heute“.
3. Bei mehreren Projekten: Umschalter **„Dieses Projekt | Alle Projekte“**; in der Gesamtansicht trägt jede Aufgabe ihr Projekt-Kürzel, ein Klick wechselt ins Projekt.
4. Tab-Titel und Menü-Zähler zeigen die Anzahl überfälliger und heute fälliger Aufgaben.

### 6.4 Fortschritt → externes Reporting

- **Keine eigene Fortschritts-Seite mehr:** Der Fortschritt ist im **Tacto Reporting** dokumentiert (https://nikolausridder1301.github.io/tacto/). Der Menüpunkt **„Reporting“** öffnet es in einem neuen Tab.
- Der Link ist eine Projekteinstellung („Reporting-Link im Menü“); leer = kein Menüpunkt. Für das Projekt Tacto ist er gesetzt.
- Meilensteine je Firma gibt es weiterhin als Reiter in der Firmen-Ansicht; sie speisen auch den Ampel-Vorschlag.

### 6.5 Aufgaben

- **Schlanke Filterleiste:** **Alle | Meine | Delegiert** (Delegiert = Person verantwortlich oder im offenen Schritt), Firmenfilter (Mehrfachauswahl), **Gruppieren** (nach Firma / nach Person / keine) und „Erledigte zeigen“. Kein weiteres Filter-Menü – Fälliges steht auf „Heute“, Delegiertes unter „Delegiert“. Eine Aufgabe steht in jeder ihrer Gruppen (jede Firma bzw. jede Person); ohne Firma in „Ohne Firma“.
- **Ein Termin überall:** Zeile rechts, Sortierung, Heute und Firmenkarten nutzen den **nächsten Termin** = frühestes Datum aus Fälligkeit und offenen Schritten.
- **Erledigte getrennt:** offene oben (gruppiert), darunter Trennlinie „Erledigt“ und die erledigten Aufgaben nach Erledigt-Datum, neueste zuerst.
- **Detail-Panel:** oben Häkchen **„Erledigt?“**, Titel, Chips **Firmen · Verantwortlich · Fällig · Wichtig · Blockiert** – „Wichtig“ und „Blockiert“ sind Schalter (Blockiert fragt jedes Mal einen frischen Grund ab); kein eigener Status-Chip mehr. Darunter **Schritte & Meilensteine** (6.6). Beim Schließen (auch Esc) wird noch nicht Gespeichertes gesichert.
- **Keine neuen Beschreibungen und Link-Anhänge** mehr – vorhandene werden weiter angezeigt.
- **Mehrere Firmen:** „Firmen“ ist in Schnellerfassung und Panel dieselbe Mehrfachauswahl. Mehrere Firmen = **eine Aufgabe** (wie bei mehreren Personen), sie erscheint bei jeder ihrer Firmen (Gruppierung, Firmenseite, Meeting, Filter). Was je Firma zu tun ist, steht in den Nächsten Schritten. Mindestens eine Firma bleibt gewählt; Schnellauswahl „Alle Gesellschaften“ (ohne Holding und externe Partner) unten in der Liste.
- Löschen mit „Rückgängig“ und Papierkorb.

### 6.6 Schritte & Meilensteine, Delegiert

- **Schritte & Meilensteine** je Aufgabe (ersetzt den früheren Verlauf): zwei voneinander **unabhängige Listen** – kein eigenes Objekt, alles in der Aufgabe (`checklist`).
  - **Schritte:** Text, optional **Wer?** (mehrere) und **Bis?**; Wer/Bis stehen unter dem Text (lange Texte haben die volle Breite), leer erst beim Darüberfahren. Häkchen = erledigt. Texte per Klick bearbeitbar.
  - **Meilensteine (◆):** die Etappen, auf die hingearbeitet wird – **nur Text, kein Datum, keine Schritte**; Klick auf ◆ = „erreicht“. Sie dienen der Orientierung und zählen nicht zum Fortschritt oder zu Terminen.
  - **Hinzufügen:** je Liste eine gleich aufgebaute Eingabezeile mit Enter – „Schritt hinzufügen…“ (Wer?, Bis?) unter den Schritten, „Meilenstein hinzufügen…“ unter den Meilensteinen; das Feld bleibt für den nächsten Eintrag offen. Ältere Aufgaben mit verschachtelten Schritten oder Meilenstein-Daten werden in diese zwei Listen aufgeteilt (alte Meilenstein-Daten bleiben unbenutzt gespeichert).
  - **Einfaches Markdown** in Schritten und Meilensteinen: **Enter speichert, Umschalt+Enter = neue Zeile**; „- “/„* “/„1. “ werden Aufzählungen (Enter bzw. Umschalt+Enter setzt den nächsten Punkt, ein leerer Punkt beendet die Liste, Tab/Umschalt+Tab rückt ein); `**fett**`, `*kursiv*`, `` `Code` `` und Links werden dargestellt. In Listen erscheint nur die erste Zeile ohne Zeichen.
- **In Listen:** unter dem Titel der **aktuelle Meilenstein** („◆ Export-Freigabe“) und der **nächste offene Schritt** („→ … · Arman · 23.10. · 1/3“); lange Texte mit „…“ gekürzt, Person und Datum bleiben sichtbar.
- **Termine:** Fälligkeit und offene Schritte bilden den **nächsten Termin** (Heute, Sortierung, Zeile rechts, Firmenkarten).
- **Meeting:** unter jeder offenen Aufgabe „Schritt notieren…“ – der vereinbarte Schritt kommt als neuer Schritt in die Aufgabe.
- Menüpunkt **„Delegiert“**: offene Aufgaben nach Person (verantwortlich **oder mit offenem Schritt**), **zuerst fällig oben**; Kopf „x offen · y überfällig“.
- Delegieren bleibt der Chip **„Verantwortlich“** – Mehrfachauswahl: „Ich“ oder eine bzw. mehrere Personen (eine Aufgabe). Eine Aufgabe mit mehreren Personen steht unter „Delegiert“ bei jeder von ihnen und im Meeting jeder Person.
- **Kein Verlauf mehr:** keine Update-Zeitleiste, keine „Stand“-Zeile, keine automatischen Statuszeilen. Frühere Updates bleiben in der Datenbank, werden aber nicht angezeigt.

### 6.7 Meeting und Kontakte – eine Ansicht

- **Eine Detailansicht für Firmen und Personen**, auch auf der Meeting-Seite. Dahinter steht **eine gemeinsame Logik „was gehört zu X“** (`buildBriefing`); Detailansicht, Agenda und Protokoll nutzen sie alle.
  - **Kopf:** Logo bzw. Initialen, Name; bei Firmen Ampel mit „Ampel ändern“ und darunter ihre Personen (mit „+ Person“); bei Personen Firma, Rolle, E-Mail, Telefon und „Bearbeiten“ (Name, Firma, Rolle, Kontakt, aktiv, löschen). Rechts **„Agenda kopieren“** und **„Protokoll starten“**.
  - **Reiter:** **Offen · Notizen · Links**, bei Firmen zusätzlich **Meilensteine · {Anbieter} · Ampel-Verlauf**.
  - **Offen:** bei Personen „Offen bei …“ (verantwortlich oder offener Schritt), dazu meine und weitere offene Punkte ihrer Firma; bei Firmen alles, was die Firma betrifft. Blockiertes zuerst, unter jeder Aufgabe ein dezentes **„Schritt notieren…“**. Nichts offen: Karte mit „Aufgabe anlegen“. Erledigte auf Wunsch („x erledigte anzeigen“).
- **Meeting** bleibt im Menü für den schnellen Zugriff: oben Person oder Firma wählen (Suche, letzte Auswahl bleibt), darunter genau diese Ansicht.
- **„Protokoll starten“** öffnet das **heutige Protokoll** mit dieser Person/Firma oder legt es an (Teilnehmer, Firma, Datum). Im Protokoll stehen die **offenen Punkte als Liste mit „Schritt notieren…“** – was vereinbart wird, landet direkt als Schritt in der Aufgabe; der Text bleibt für freie Notizen (keine kopierte Agenda mehr).
- **„Agenda kopieren“** in die Zwischenablage (mit offenen Schritten); für die Anbieter-Firma selbst der Jour-fixe-Text.
- **Anbieter-Punkte:** Firma → was sie betrifft (inkl. „Alle Firmen“); Anbieter-Firma und ihre Leute → alle offenen; Person einer Gesellschaft → wo sie Ansprechpartner ist oder ihre Firma ausdrücklich genannt ist. Bei Personen stehen sie im Reiter „Offen“.
- **„Aufgabe anlegen“ / „+ Neu“ in einer Personen-Ansicht** belegt diese Person als Verantwortliche vor (ebenso „Aufgabe daraus“ bei genau einem Teilnehmer).

### 6.8 Notizen

Arten **Notiz · Meeting-Protokoll · Entscheidung** (Entscheidungen bewusst getrennt). Notizen öffnen sich – wie Aufgaben – als **Pop-up-Panel** über der aktuellen Seite (aus der Liste, der Suche, dem Meeting, der Firmen-/Personenseite); Direktlinks `/notizen/:id` öffnen ebenfalls das Panel. Chips für Art, Firma, Datum; Teilnehmer bei Protokollen; Text als mitwachsendes Feld (kein Wechsel zwischen Bearbeiten und Vorschau); Aufzählungen mit „- “ setzen sich bei Enter fort, Tab rückt ein. **„Aufgabe daraus“** übernimmt markierten Text als Aufgabe, verknüpft in beide Richtungen; Bereiche klappen auf, sobald sie Inhalt bekommen. **Adressen im Text werden automatisch als klickbare Links** darunter gezeigt; früher angehängte Links bleiben sichtbar, neue Anhänge gibt es nicht mehr.

### 6.9 Anbieter-Bereich (bei Tacto: „Tacto“)

- Optional je Projekt (Projekteinstellungen: Anbieter-Firma oder „Aus“); Menüpunkt trägt den Anbieternamen.
- Reiter **Features · Fragen · Bugs · Best Practices · Claims** mit Zahl der offenen Punkte; Firmenfilter; Erledigte über „X erledigte anzeigen“.
- **Erfassen per Zeile** oben in der Liste (Titel + Enter, kein Platzhalter-Eintrag).
- Status je Kategorie; beim ersten Weg zum Anbieter wird das Meldedatum gesetzt („seit 23 T. bei Tacto“).
- Detail: Chips Status · Firmen (Mehrfachauswahl, leer = alle) · Wichtig; Ansprechpartner und Kategorie hinter „Mehr…“; Ticketfeld erst ab Meldung; Fragen mit Antwort (setzt „Beantwortet“, „Als Best Practice übernehmen“); Claims mit Versprochen/Tatsächlich/Beleg.
- **„Für Jour fixe kopieren“**: offene Punkte nach Kategorie als Text.

### 6.10 Firmen, Ampel, Personen, Links

- **Ampel ändern nur im Dialog:** Grün/Gelb/Rot, **Begründung Pflicht bei Gelb und Rot**, jede Änderung im **Ampel-Verlauf**. Der Dialog zeigt einen **Vorschlag aus den Meilensteinen** (verzögert/überfällig → Rot, kritisch → Gelb) mit „Übernehmen“ – die Entscheidung bleibt manuell.
- **Kontakte** (Firmen & Personen, ein Menüpunkt statt zwei): oben **Firmen**, darunter abgesetzt **Personen** – jeweils gleich aufgebaute Karten, die Fußzeile mit Trennlinie liegt immer auf gleicher Höhe. Firmenkarte: Logo, Name, Ampel, Ampel-Hinweis (max. zwei Zeilen), unten Zahl der Personen und – nur wenn vorhanden – „x Aufgaben offen“ (betrifft die Firma) und „x überfällig“. Personenkarte: Initialen, Name, Rolle, unten Firma und – nur wenn vorhanden – „x Aufgaben offen“ (verantwortlich oder mit offenem Schritt). Kein „0 offen“. „+ Person“ über der Personenliste (Name + Firma); Suche nach Firma oder Person; „Inaktive zeigen“. Klick öffnet die gemeinsame Detailansicht (6.7).
- **Links:** zentrale Sammlung mit Firma und Kategorie, URL-Prüfung (nur `http(s)`).

### 6.11 Schnellerfassung

Taste **N** oder „+ Neu“: Typ **Aufgabe · Notiz · Protokoll · Entscheidung · Link**. **Notiz, Protokoll und Entscheidung öffnen sich mit einem Klick direkt im Pop-up** (Titel „Meeting – TT.MM.JJJJ“ o. ä. vorbelegt und markiert, Datum heute, ggf. schon getippter Titel übernommen); wird so ein Eintrag unverändert geschlossen, verschwindet er wieder. Aufgaben und Links: Titel, Enter – Aufgaben öffnen sich danach ebenfalls im Pop-up. Ausnahme: „Aufgabe daraus“ im Protokoll bleibt im Protokoll (die Aufgabe erscheint dort unter „Aufgaben“). Links werden nur gespeichert. Chips für Firma (aus dem Kontext vorbelegt; bei Aufgaben Mehrfachauswahl), Verantwortlich, Fällig, Wichtig bzw. Kategorie. Entwürfe bleiben erhalten.

### 6.12 Suche

**Strg+K** über Aufgaben (inkl. Schritte und Meilensteine), Notizen, Anbieter-Punkte, Links, Personen und Firmen des aktuellen Projekts.

### 6.13 Papierkorb

Gelöschtes (Aufgaben, Notizen, Links, Anbieter-Punkte, Personen, Firmen) landet im Papierkorb (je Projekt), wiederherstellbar oder endgültig löschbar; 5 Sekunden „Rückgängig“. Endgültig löschen geht bei Personen/Firmen nur, wenn sie nirgends mehr vorkommen. 

### 6.14 Backup und Einstellungen

- **Backup** per Download-Icon in der Kopfzeile (alle Projekte, JSON); oranger Punkt, wenn das letzte Backup älter als 14 Tage ist. Keine Banner-Leiste.
- **Einstellungen:** Projekt (Name, Kürzel, Farbe, Reporting-Link – nur http(s) –, Anbieter-Bereich, Archivieren, bei nur einem Projekt „Neues Projekt…“) · Backup · Menü (Standard-Reihenfolge) · Firmen (inkl. „Partner“; neue Firma per Eingabezeile + Enter, Entfernen in den Papierkorb) · Meilensteine (nur ohne Reporting-Link) · Link-Kategorien.

### 6.15 Mobil

Seitenleiste als Menü; Heute, Abhaken, Schnellerfassung, Schritte und alle Dialoge ohne seitliches Scrollen; breite Tabellen scrollen in sich.

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
- Meilensteine je Firma: Status setzen/ändern ohne Duplikate; überschrittene Ziele markiert; Ampel-Vorschlag passend.
- Schritte und Meilensteine je Aufgabe unabhängig voneinander (Meilensteine ohne Datum und Schritte); aktueller Meilenstein und nächster Schritt in der Zeile; „Delegiert“ sortiert nach nächstem Termin.
- Meeting-Briefing zeigt nur die gewählte Person/Firma; Protokoll mit Agenda und Teilnehmer.
- Erledigte Aufgaben unter Trennlinie nach Datum.
- Menü per Ziehen sortierbar, ohne versehentlichen Seitenwechsel.
- Keine Themen-Felder außerhalb der Meilensteine; keine neuen Beschreibungen/Links an Aufgaben.
- Alle Seiten ohne seitliches Scrollen bei 375 px und 1280 px.

## 10. Offene Punkte

- Interne Freigabe zur Speicherung von Projektnotizen und Kontaktdaten bei Supabase (EU) – liegt bei Nikolaus.
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
| Nachhaken | Ersetzt durch **Verlauf** (datierte Updates je Aufgabe); kein Nachhak-Datum, kein „Heute nachhaken“ |
| Ampel | Nur im Dialog mit Begründung und Verlauf; Vorschlag aus Meilensteinen |
| Erledigte | Unter Trennlinie, nach Datum |
| Meeting | Briefing zu Person/Firma mit Protokoll-Start |
| Themen | Werden Meilensteine (je Firma); kein Thema-Feld mehr an Einträgen |
| Benennung | „Wartet auf…“ → „Delegiert“ |
| Aufgaben-Panel | Keine neuen Beschreibungen und Links |
| Meeting-Seite | Ohne Kopfkarte und „Erledigt“-Bereich; neuer Leer-Zustand mit „Aufgabe anlegen“ |
| Mehrere Firmen | Kein „x/y Firmen“-Zähler mehr; Fortschritt nur über Nächste Schritte |
| Nächste Schritte | Checkliste wird zu „Nächste Schritte“ mit optional Person und Datum (Unteraufgabe ohne eigenes Objekt); fällige Schritte auf Heute und im Meeting; Abhaken schreibt in den Verlauf; Verlauf-Datum änderbar |
| Firmenauswahl | Ein Mehrfach-Dropdown statt Firma + „Mehrere Firmen“ |
| Meilensteine statt Verlauf | Verlauf entfällt (doppelte Einträge, wenig Nutzen); stattdessen **Schritte & Meilensteine** je Aufgabe; Listen zeigen aktuellen Meilenstein; Meeting legt Schritte an; Delegiert nach nächstem Termin |
| Meilensteine einfach | Meilensteine ohne Datum und ohne eigene Schritte – nur Orientierung; Schritte und Meilensteine sind zwei unabhängige Listen mit gleicher Eingabe |
| Review mit Subagenten (16.10.2026) | 10 Fehler behoben (u. a. ein Termin überall, Delegiert inkl. Schritt-Personen, Gruppen je Person, Vorbelegung der Person, Speichern bei Esc, gleichzeitige Änderungen, Datum um Mitternacht, Ampel „seit“, Agenda-Anbieterpunkte, Verlauf löschen mit Rückgängig); Vereinfachungen: Blockiert-Schalter statt Status-Chip, schlanke Filterleiste, Schritte vor Verlauf, automatische Statuszeilen, Protokoll mit Live-Liste, Meilensteine ausgeblendet bei Reporting-Link, schlichter Projekt-Umschalter, Firmen per Eingabezeile, Links im Text statt Anhänge, toter Code entfernt; Ergänzungen: Schritt bearbeiten, Protokoll wiederverwenden, Suche über Verlauf und Firmen, Jour-fixe als Agenda der Anbieter-Firma |
| Fortschritt | Menüpunkt „Fortschritt“ entfällt; stattdessen Link „Reporting“ zum Tacto Reporting (Projekteinstellung `report_url`) |
| Kontakte-Übersicht | Firmen und Personen getrennt (Firmen oben, Personen darunter), einheitliche Karten mit Fußzeile auf gleicher Höhe, klare Zahlen statt „0 offen“ |
| Kontakte | Menüpunkt „Kontakte“ (kurz, passt in eine Zeile) für Firmen & Personen; ein Bereich statt zwei Seiten; gemeinsame Detailansicht und Logik für Firma, Person und Meeting; Meeting bleibt als Menüpunkt für den schnellen Zugriff |
| Mehrfachauswahl überall | Firmen und Personen überall Mehrfachauswahl in derselben Liste; mehrere Firmen = eine Aufgabe (keine Kopien mehr); auch Notizen, Links, Teilnehmer, Schritte, Tacto-Ansprechpartner |
| Verantwortlich | Mehrfachauswahl: mehrere Personen je Aufgabe (eine Aufgabe, keine Kopien); „Ich“ = niemand sonst |
| Filterleisten | Firmenfilter als Mehrfach-Dropdown auf Aufgaben, Notizen, Links, Tacto; keine Browser-Auswahlfelder mehr in Filtern |
| Priorität | Nur noch Fahne „Wichtig“ (an/aus); „Niedrig“ entfällt |
| Status | Offen · Blockiert · Erledigt; „In Arbeit“ entfällt |
| Neu anlegen | Nur über „+ Neu“ mit allen Arten; das Neue öffnet sich danach im Pop-up; Notizen als Pop-up-Panel statt eigener Seite |
| Protokoll anlegen | Klick auf Protokoll/Notiz/Entscheidung öffnet sofort die volle Ansicht (kein Zwischendialog); leere neue Einträge werden beim Schließen verworfen; Ungespeichertes wird beim Schließen gesichert |
| Notiz-Arten | Bleiben drei: Entscheidungen werden bewusst getrennt von Protokollen festgehalten, weil sie auch außerhalb von Meetings fallen |
