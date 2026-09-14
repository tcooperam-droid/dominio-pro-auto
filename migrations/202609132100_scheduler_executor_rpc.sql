-- Executor server-side do scheduler: o cliente apenas solicita uma operação;
-- a autoridade de conflito, hold e confirmação é o PostgreSQL.
create or replace function public.scheduler_reserve_appointment(
  p_request_key text,
  p_client_id bigint,
  p_employee_id bigint,
  p_service_id bigint,
  p_start_time timestamptz,
  p_end_time timestamptz,
  p_confirm boolean default false,
  p_force_conflict boolean default false
) returns jsonb
language plpgsql security invoker set search_path = public
as $$
declare
  c clients%rowtype; e employees%rowtype; s services%rowtype;
  h appointment_holds%rowtype; conflict_row appointments%rowtype;
  existing_row appointments%rowtype; created_row appointments%rowtype;
  snapshot jsonb;
begin
  if p_request_key is null or length(trim(p_request_key)) < 8 then
    return jsonb_build_object('ok', false, 'code', 'INVALID_REQUEST_KEY', 'message', 'Chave de solicitação inválida.');
  end if;
  if p_end_time <= p_start_time then
    return jsonb_build_object('ok', false, 'code', 'INVALID_INTERVAL', 'message', 'Intervalo inválido.');
  end if;
  select * into c from clients where id = p_client_id;
  if not found then return jsonb_build_object('ok', false, 'code', 'CLIENT_NOT_FOUND', 'message', 'Cliente não encontrado.'); end if;
  select * into e from employees where id = p_employee_id and active;
  if not found then return jsonb_build_object('ok', false, 'code', 'EMPLOYEE_NOT_FOUND', 'message', 'Profissional não encontrado ou inativo.'); end if;
  select * into s from services where id = p_service_id and active;
  if not found then return jsonb_build_object('ok', false, 'code', 'SERVICE_NOT_FOUND', 'message', 'Serviço não encontrado ou inativo.'); end if;

  perform pg_advisory_xact_lock(hashtextextended(p_request_key, 0));
  if not p_confirm then
    select * into conflict_row from appointments
      where employee_id = p_employee_id and status <> 'cancelled'
        and start_time < p_end_time and end_time > p_start_time limit 1;
    if found and not p_force_conflict then
      return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'message', 'O profissional já possui agendamento neste intervalo.');
    end if;
    insert into appointment_holds(request_key, client_id, client_name, employee_id, service_id, start_time, end_time, status, expires_at)
    values(p_request_key, p_client_id, c.name, p_employee_id, p_service_id, p_start_time, p_end_time, 'pending', now() + interval '10 minutes')
    on conflict(request_key) do update set client_id=excluded.client_id, client_name=excluded.client_name,
      employee_id=excluded.employee_id, service_id=excluded.service_id, start_time=excluded.start_time,
      end_time=excluded.end_time, status='pending', expires_at=excluded.expires_at
    returning * into h;
    return jsonb_build_object('ok', true, 'code', 'HOLD_CREATED', 'client_name', c.name,
      'service_name', s.name, 'service_duration', s.duration_minutes, 'request_key', p_request_key, 'expires_at', h.expires_at);
  end if;

  select * into h from appointment_holds where request_key = p_request_key for update;
  if not found or h.status <> 'pending' or h.expires_at <= now()
     or h.client_id <> p_client_id or h.employee_id <> p_employee_id or h.service_id <> p_service_id
     or h.start_time <> p_start_time or h.end_time <> p_end_time then
    return jsonb_build_object('ok', false, 'code', 'HOLD_EXPIRED', 'message', 'A confirmação expirou ou não corresponde à proposta.');
  end if;

  select * into existing_row from appointments
    where client_id=p_client_id and employee_id=p_employee_id and status <> 'cancelled'
      and start_time=p_start_time and end_time=p_end_time
      and services @> jsonb_build_array(jsonb_build_object('serviceId', p_service_id)) limit 1;
  if found then
    update appointment_holds set status='confirmed', confirmed_appointment_id=existing_row.id where id=h.id;
    return jsonb_build_object('ok', true, 'code', 'ALREADY_CONFIRMED', 'appointment_id', existing_row.id, 'client_name', existing_row.client_name);
  end if;

  select * into conflict_row from appointments
    where employee_id=p_employee_id and status <> 'cancelled'
      and start_time < p_end_time and end_time > p_start_time limit 1;
  if found and not p_force_conflict then
    return jsonb_build_object('ok', false, 'code', 'CONFLICT', 'message', 'O profissional foi ocupado antes da confirmação.');
  end if;

  snapshot := jsonb_build_array(jsonb_build_object('serviceId', s.id, 'name', s.name, 'price', s.price,
    'durationMinutes', s.duration_minutes, 'color', s.color, 'materialCostPercent', 0, 'commissionMode', 'cost_first'));
  insert into appointments(client_name, client_id, employee_id, start_time, end_time, status, total_price, services)
    values(c.name, c.id, e.id, p_start_time, p_end_time, 'scheduled', s.price, snapshot) returning * into created_row;
  update appointment_holds set status='confirmed', confirmed_appointment_id=created_row.id where id=h.id and status='pending';
  if not found then return jsonb_build_object('ok', false, 'code', 'HOLD_COMMIT_FAILED', 'message', 'A reserva já foi consumida.'); end if;
  return jsonb_build_object('ok', true, 'code', 'CONFIRMED', 'appointment_id', created_row.id, 'client_name', c.name,
    'service_name', s.name, 'service_duration', s.duration_minutes);
exception when unique_violation then
  return jsonb_build_object('ok', false, 'code', 'DUPLICATE_OR_CONFLICT', 'message', 'Este horário foi confirmado por outra solicitação.');
end;
$$;

grant execute on function public.scheduler_reserve_appointment(text,bigint,bigint,bigint,timestamptz,timestamptz,boolean,boolean) to authenticated, anon;
