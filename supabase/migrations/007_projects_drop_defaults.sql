-- Nach dem Deploy der Projekt-Version: Übergangs-Standardwerte aus 006 entfernen.
-- Die App setzt project_id ab jetzt immer selbst.
do $$
declare
  t text;
begin
  foreach t in array array[
    'companies', 'topics', 'link_categories', 'people', 'notes', 'tasks', 'links', 'vendor_items'
  ] loop
    execute format('alter table %I alter column project_id drop default', t);
  end loop;
end;
$$;
