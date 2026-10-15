-- Projecttracker – Startbelegung (SPEC.md Abschnitt 4)
-- Nach 001_schema.sql einmal im SQL Editor ausführen.

do $$
declare
  pid uuid;
begin
  -- Erstes Projekt; weitere legst du in der App an (mit Kopie der Stammdaten)
  insert into projects (name, short, color, sort) values ('Tacto', 'TAC', '#ea7a0c', 0) returning id into pid;

  insert into companies (project_id, name, short, color, logo_key, is_overarching, is_external, sort) values
    (pid, 'SK Group (Übergreifend)', 'SK', '#161b26', 'sk', true, false, 0),
    (pid, 'HAZEMAG', 'HAZ', '#c2410c', 'hazemag', false, false, 1),
    (pid, 'Allmineral', 'ALM', '#0f766e', 'allmineral', false, false, 2),
    (pid, 'Maximator', 'MAX', '#1d4ed8', 'maximator', false, false, 3),
    (pid, 'Maximator Hydrogen', 'MXH', '#0891b2', 'maximator-hydrogen', false, false, 4),
    (pid, 'FEST', 'FEST', '#7c3aed', 'fest', false, false, 5),
    (pid, 'Perforator', 'PER', '#be123c', 'perforator', false, false, 6),
    (pid, 'Tacto', 'TAC', '#ea7a0c', 'tacto', false, true, 7);

  insert into topics (project_id, name, sort) values
    (pid, 'Projektmanagement/Allgemein', 0),
    (pid, 'Datentransfer: lesen', 1),
    (pid, 'Datentransfer: schreiben', 2),
    (pid, 'Warengruppen', 3),
    (pid, 'Analytics', 4),
    (pid, 'Einsparungen (Hinweise)', 5),
    (pid, 'RFQs', 6),
    (pid, 'Agenten', 7),
    (pid, 'Lieferantenabfragen', 8),
    (pid, 'Lieferantenbewertungen', 9),
    (pid, 'Auftragsbestätigung', 10),
    (pid, 'Schulung/Academy', 11),
    (pid, 'Stammdaten', 12);

  insert into link_categories (project_id, name, sort) values
    (pid, 'Konzept', 0),
    (pid, 'Vertrag/Angebot', 1),
    (pid, 'Schulung', 2),
    (pid, 'Technik', 3),
    (pid, 'Protokoll', 4),
    (pid, 'Sonstiges', 5);

  update projects set vendor_company_id = (select id from companies where project_id = pid and name = 'Tacto') where id = pid;
end;
$$;

insert into app_meta (last_export_at) values (null);
