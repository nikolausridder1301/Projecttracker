-- Wachhalten gegen das Pausieren im Gratis-Plan: eine echte, erfolgreiche Datenbankabfrage ohne Daten.
-- (Ein abgewiesener Abruf mit 401 zählt bei Supabase nicht als Aktivität.)
create or replace function public.keep_alive()
returns timestamptz
language sql
stable
set search_path = ''
as $$ select now() $$;

revoke all on function public.keep_alive() from public;
grant execute on function public.keep_alive() to anon, authenticated;
