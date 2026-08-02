-- Los clientes aplicables a una reserva son los de la org propietaria del
-- edificio (igual que los planes). Los miembros de la org gestora de un
-- edificio co-gestionado necesitan verlos (autocompletar) y darlos de alta
-- al vuelo: misma excepción que ya tiene planes_select.

drop policy clientes_select on clientes;
create policy clientes_select on clientes for select using (
  es_miembro(org_id)
  or exists (
    select 1 from edificios e
    where e.org_propietaria_id = clientes.org_id
      and e.org_gestora_id is not null and es_miembro(e.org_gestora_id)
  )
);

drop policy clientes_insert on clientes;
create policy clientes_insert on clientes for insert with check (
  es_miembro(org_id)
  or exists (
    select 1 from edificios e
    where e.org_propietaria_id = clientes.org_id
      and e.org_gestora_id is not null and es_miembro(e.org_gestora_id)
  )
);
