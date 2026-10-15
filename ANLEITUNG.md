# Einrichtung – Schritt für Schritt

Einmalig, ca. 20 Minuten. Danach läuft alles automatisch: Jeder Push auf `main` veröffentlicht die App.

## 1. Supabase-Projekt anlegen

1. Auf [supabase.com](https://supabase.com) registrieren und anmelden.
2. **New project** → Name z. B. `projecttracker`, ein sicheres Datenbank-Passwort vergeben (wird später nicht mehr gebraucht, trotzdem notieren), **Region: Central EU (Frankfurt)** → *Create new project*. Das dauert etwa 2 Minuten.

## 2. Datenbank einrichten

1. Links im Menü **SQL Editor** öffnen → *New query*.
2. Den kompletten Inhalt von [`supabase/migrations/001_schema.sql`](supabase/migrations/001_schema.sql) einfügen → **Run**. Erwartet: „Success. No rows returned".
3. Neue Query, Inhalt von [`supabase/migrations/002_seed.sql`](supabase/migrations/002_seed.sql) einfügen → **Run**.
4. Kontrolle: Links **Table Editor** → Tabelle `companies` zeigt 7 Firmen.

## 3. Registrierung abschalten und eigenen Login anlegen

1. **Authentication → Sign In / Providers** (bzw. *Providers*): Schalter **„Allow new users to sign up"** ausschalten → *Save*. Damit kann sich niemand sonst ein Konto anlegen.
2. **Authentication → Users → Add user → Create new user**: deine E-Mail und ein Passwort eintragen, **„Auto Confirm User"** anhaken → *Create user*.
   Das Passwort gibst du nur hier und später in der Login-Maske ein – nirgendwo sonst.
3. **Login freischalten:** Ein Login allein sieht noch keine Daten – die User-ID muss in der Freigabeliste stehen. Im **SQL Editor** ausführen (E-Mail anpassen):

   ```sql
   insert into allowed_users (user_id) select id from auth.users where email = 'deine@mail.de';
   ```

   Erwartet: „Success. 1 row affected". So bleiben die Daten geschützt, selbst wenn die Registrierung je versehentlich eingeschaltet wäre.

## 4. Zugangsdaten für die App kopieren

**Project Settings → API Keys** (bzw. *Data API*):

- **Project URL**, z. B. `https://abcdefgh.supabase.co`
- **publishable key** `sb_publishable_…` (alternativ der ältere anon key `eyJ…`)

Beide sind für den Browser gedacht und dürfen öffentlich sein – geschützt werden die Daten durch Login + Row Level Security.
⚠️ Den **service_role**- bzw. **secret**-Key niemals verwenden oder weitergeben.

## 5. GitHub einstellen

Im Repository [Projecttracker](https://github.com/nikolausridder1301/Projecttracker):

1. **Settings → General → ganz unten „Danger Zone" → Change visibility → Public.**
2. **Settings → Pages → Build and deployment → Source: „GitHub Actions".**
3. **Settings → Secrets and variables → Actions → Reiter „Variables" → New repository variable**, zweimal:
   - `SUPABASE_URL` = Project URL aus Schritt 4
   - `SUPABASE_ANON_KEY` = anon/publishable key aus Schritt 4

## 6. Veröffentlichen

Sobald der Code auf `main` liegt (Pull Request mergen), baut GitHub die App automatisch (Reiter **Actions** → „Deploy"). Danach ist sie erreichbar unter:

**https://nikolausridder1301.github.io/Projecttracker/**

Mit deiner E-Mail und deinem Passwort aus Schritt 3 anmelden. Du bleibst danach eingeloggt.

## 7. Keep-alive prüfen

Reiter **Actions → „Supabase Keep-alive" → Run workflow**. Grüner Haken = funktioniert. Danach läuft er automatisch alle 3 Tage, damit Supabase das Projekt nicht pausiert.

## 8. Sicherheitstest (einmal, optional)

Prüft, dass ohne Login keine Daten abrufbar sind. In einem Terminal (Git Bash) – `URL` und `KEY` ersetzen:

```bash
curl -s "URL/rest/v1/tasks?select=*" -H "apikey: KEY" -H "Authorization: Bearer KEY"
```

Erwartet: eine Fehlermeldung (`permission denied`) oder `[]` – **niemals** Aufgaben.

---

## Regelmäßig

- **Backup:** Einstellungen → „Export als JSON" → Datei ins OneDrive. Die App erinnert dich nach 14 Tagen.
- **Passwort vergessen:** Supabase → Authentication → Users → dein User → *Send password recovery* bzw. neues Passwort setzen.
