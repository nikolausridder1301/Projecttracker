-- Schritt 2 (nach dem Deploy): Einträge aus dem Übergang nachziehen, alte Spalten entfernen.
-- Die Gruppen-Kennung für „je Firma eine Kopie“ wird nicht mehr gebraucht.

update public.tasks set company_ids = array[company_id] where company_id is not null and cardinality(company_ids) = 0;
update public.notes set company_ids = array[company_id] where company_id is not null and cardinality(company_ids) = 0;
update public.links set company_ids = array[company_id] where company_id is not null and cardinality(company_ids) = 0;
update public.vendor_items set contact_person_ids = array[contact_person_id]
where contact_person_id is not null and cardinality(contact_person_ids) = 0;

alter table public.tasks drop column company_id;
alter table public.tasks drop column group_id;
alter table public.notes drop column company_id;
alter table public.links drop column company_id;
alter table public.vendor_items drop column contact_person_id;
