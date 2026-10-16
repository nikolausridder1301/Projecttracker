-- Link zum externen Reporting je Projekt (Menüpunkt „Reporting“); ersetzt die Fortschritts-Seite.
alter table public.projects add column report_url text not null default '';
update public.projects set report_url = 'https://nikolausridder1301.github.io/tacto/' where name = 'Tacto' and report_url = '';
