-- =====================================================================
--  Cambio del 19/11/2026: actividad de cada corredor.
--  Guarda la última vez que cada corredor abrió la app con su enlace, para
--  que la dirección vea quién la usa y quién no la ha abierto nunca.
--  Se puede ejecutar más de una vez.
-- =====================================================================
alter table public.runners add column if not exists last_seen timestamptz;

create or replace function public.runner_ping(p_code text)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- como mucho una escritura por hora y corredor
  update runners set last_seen = now()
   where code = p_code and (last_seen is null or last_seen < now() - interval '1 hour');
end $$;
revoke execute on function public.runner_ping(text) from public, anon;
grant execute on function public.runner_ping(text) to anon, authenticated;
