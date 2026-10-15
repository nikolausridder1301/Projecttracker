-- Projecttracker – Startbelegung (SPEC.md Abschnitt 4)
-- Nach 001_schema.sql einmal im SQL Editor ausführen.

insert into companies (name, short, color, logo_key, is_overarching, sort) values
  ('SK Group (Übergreifend)', 'SK', '#161b26', 'sk', true, 0),
  ('HAZEMAG', 'HAZ', '#c2410c', 'hazemag', false, 1),
  ('Allmineral', 'ALM', '#0f766e', 'allmineral', false, 2),
  ('Maximator', 'MAX', '#1d4ed8', 'maximator', false, 3),
  ('Maximator Hydrogen', 'MXH', '#0891b2', 'maximator-hydrogen', false, 4),
  ('FEST', 'FEST', '#7c3aed', 'fest', false, 5),
  ('Perforator', 'PER', '#be123c', 'perforator', false, 6);

insert into topics (name, sort) values
  ('Projektmanagement/Allgemein', 0),
  ('Datentransfer: lesen', 1),
  ('Datentransfer: schreiben', 2),
  ('Warengruppen', 3),
  ('Analytics', 4),
  ('Einsparungen (Hinweise)', 5),
  ('RFQs', 6),
  ('Agenten', 7),
  ('Lieferantenabfragen', 8),
  ('Lieferantenbewertungen', 9),
  ('Auftragsbestätigung', 10),
  ('Schulung/Academy', 11),
  ('Stammdaten', 12);

insert into link_categories (name, sort) values
  ('Konzept', 0),
  ('Vertrag/Angebot', 1),
  ('Schulung', 2),
  ('Technik', 3),
  ('Protokoll', 4),
  ('Sonstiges', 5);

insert into app_meta (last_export_at) values (null);
