-- Bucket de comprobantes de pago.
--
-- Privado, a diferencia del de espacios: un comprobante de transferencia trae
-- CBU, titular y montos. Con el bucket público, cualquiera con la URL lo
-- abriría; acá se sirve con URL firmada de vida corta.
--
-- Ruta: <org_id>/<reserva_id>/<uuid>.<ext>, para que las policies puedan
-- resolver la organización desde el primer segmento del nombre.

insert into storage.buckets (id, name, public, file_size_limit)
values ('comprobantes', 'comprobantes', false, 5242880)  -- 5 MB
on conflict (id) do nothing;

create policy comprobantes_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'comprobantes'
    and tiene_permiso((split_part(name, '/', 1))::uuid, 'finanzas')
  );

create policy comprobantes_select on storage.objects for select to authenticated
  using (
    bucket_id = 'comprobantes'
    and tiene_permiso((split_part(name, '/', 1))::uuid, 'finanzas')
  );

create policy comprobantes_delete on storage.objects for delete to authenticated
  using (
    bucket_id = 'comprobantes'
    and tiene_permiso((split_part(name, '/', 1))::uuid, 'finanzas')
  );
