-- Recoger la respuesta de Claude: coge el bloque de TEXTO aunque venga un bloque de razonamiento antes. UN trozo; se puede repetir.
create or replace function public.admin_chronicle_ai_collect()
returns int language plpgsql security definer set search_path = public as $$
declare r record; resp record; txt text; n int := 0;
begin
  perform public.require_admin();
  for r in select id, ai_req, ai_at from chronicle_posts where ai_state = 'pendiente' and ai_req is not null loop
    select * into resp from net._http_response where id = r.ai_req;
    if resp.id is null then
      if r.ai_at < now() - interval '30 minutes' then update chronicle_posts set ai_state = 'error' where id = r.id; n := n + 1; end if;
    else
      txt := null;
      begin
        if resp.status_code = 200 then
          select string_agg(b->>'text', E'\n') into txt from jsonb_array_elements(resp.content::jsonb->'content') b where b->>'type' = 'text';   -- puede venir un bloque de razonamiento antes del texto
          txt := nullif(trim(txt), '');
        end if;
      exception when others then txt := null;
      end;
      update chronicle_posts set ai_state = case when txt is null then 'error' else 'hecho' end,
        final_text = case when txt is not null and coalesce(final_text, '') = '' then left(txt, 4000) else final_text end where id = r.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $$;
grant execute on function public.admin_chronicle_ai_collect() to authenticated;
revoke execute on function public.admin_chronicle_ai_collect() from anon, public;
