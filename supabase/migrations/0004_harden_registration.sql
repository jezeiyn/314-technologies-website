-- Registration hardening. No table changes: the form payload and the answer stay the same.
--
-- What changes in submit_application():
--   * links must be real http(s) addresses, otherwise the registration is refused
--   * an empty list of engagement types gets its own error instead of a raw constraint failure
--   * a flood cap: more than 40 website registrations in ten minutes are refused until it calms down
--   * the function pins pg_temp last in its search path
-- It still answers the same way whether or not the email is already registered, so the form
-- cannot be used to find out who is in the network.

create or replace function public.submit_application(payload jsonb) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id      uuid;
  v_email   text := lower(trim(payload->>'email'));
  v_name    text := trim(payload->>'full_name');
  v_modes   text[];
  v_work    text[];
  v_langs   text[];
  v_sectors text[];
  v_policy  text := coalesce(nullif(payload->>'policy_version',''), 'unversioned');
  v_url     text;
  r         jsonb;
begin
  if payload is null or jsonb_typeof(payload) <> 'object' then raise exception 'invalid_payload'; end if;
  if v_name is null or char_length(v_name) < 2 then raise exception 'name_required'; end if;
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'email_invalid'; end if;
  if coalesce((payload->'consents'->>'talent_database')::boolean, false) is not true then raise exception 'consent_required'; end if;
  if jsonb_array_length(coalesce(payload->'skills','[]')) > 80
     or jsonb_array_length(coalesce(payload->'domains','[]')) > 20
     or jsonb_array_length(coalesce(payload->'credentials','[]')) > 20
     or jsonb_array_length(coalesce(payload->'offerings','[]')) > 40 then
    raise exception 'payload_too_large';
  end if;

  foreach v_url in array array[payload->>'linkedin_url', payload->>'github_url', payload->>'portfolio_url'] loop
    if nullif(trim(v_url), '') is not null and trim(v_url) !~* '^https?://[^[:space:]]{3,}$' then
      raise exception 'url_invalid';
    end if;
  end loop;

  select coalesce(array_agg(x), '{}') into v_modes   from jsonb_array_elements_text(coalesce(payload->'engagement_modes','[]')) x;
  select coalesce(array_agg(x), '{}') into v_work    from jsonb_array_elements_text(coalesce(payload->'work_modes','[]')) x;
  select coalesce(array_agg(x), '{}') into v_langs   from jsonb_array_elements_text(coalesce(payload->'languages','[]')) x;
  select coalesce(array_agg(x), '{}') into v_sectors from jsonb_array_elements_text(coalesce(payload->'sectors','[]')) x;
  if cardinality(v_modes) = 0 then raise exception 'modes_required'; end if;

  if exists (select 1 from professionals where lower(email) = v_email) then
    return jsonb_build_object('ok', true);
  end if;

  if (select count(*) from professionals where source in ('website','referral') and created_at > now() - interval '10 minutes') >= 40 then
    raise exception 'try_later';
  end if;

  insert into professionals (
    full_name, email, phone, country, city, headline, bio, current_title, current_employer,
    employer_display, employer_approval_needed, seniority, years_experience, languages, sectors,
    linkedin_url, github_url, portfolio_url, engagement_modes, availability, available_from,
    rate_currency, day_rate_min, day_rate_max, advisory_hourly_rate, work_modes, willing_to_relocate,
    advisory_topics, other_skills, referred_by, source, status, verification_level
  ) values (
    v_name, v_email, nullif(trim(payload->>'phone'),''), nullif(trim(payload->>'country'),''), nullif(trim(payload->>'city'),''),
    nullif(trim(payload->>'headline'),''), nullif(trim(payload->>'bio'),''),
    nullif(trim(payload->>'current_title'),''), nullif(trim(payload->>'current_employer'),''),
    coalesce(nullif(payload->>'employer_display',''), 'named'),
    coalesce((payload->>'employer_approval_needed')::boolean, false),
    nullif(payload->>'seniority',''), nullif(payload->>'years_experience','')::int, v_langs, v_sectors,
    nullif(trim(payload->>'linkedin_url'),''), nullif(trim(payload->>'github_url'),''), nullif(trim(payload->>'portfolio_url'),''),
    v_modes, coalesce(nullif(payload->>'availability',''), 'within_30_days'), nullif(payload->>'available_from','')::date,
    coalesce(nullif(payload->>'rate_currency',''), 'AED'),
    nullif(payload->>'day_rate_min','')::numeric, nullif(payload->>'day_rate_max','')::numeric,
    nullif(payload->>'advisory_hourly_rate','')::numeric, v_work,
    coalesce((payload->>'willing_to_relocate')::boolean, false),
    nullif(trim(payload->>'advisory_topics'),''), nullif(trim(payload->>'other_skills'),''),
    nullif(trim(payload->>'referred_by'),''),
    case when nullif(trim(payload->>'referred_by'),'') is not null then 'referral' else 'website' end,
    'pending', 'self_declared'
  ) returning id into v_id;

  for r in select * from jsonb_array_elements(coalesce(payload->'domains','[]')) loop
    insert into professional_domains (professional_id, domain_id, is_primary, years)
    select v_id, d.id, coalesce((r->>'is_primary')::boolean, false), nullif(r->>'years','')::numeric
    from domains d where d.slug = r->>'slug'
    on conflict do nothing;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(payload->'skills','[]')) loop
    insert into professional_skills (professional_id, skill_id, proficiency, years)
    select v_id, s.id, coalesce(nullif(r->>'proficiency','')::smallint, 3), nullif(r->>'years','')::numeric
    from skills s where s.slug = r->>'slug'
    on conflict do nothing;
  end loop;

  insert into professional_offerings (professional_id, offering_id, added_by)
  select v_id, o.id, 'self'
  from offerings o
  where o.slug in (select jsonb_array_elements_text(coalesce(payload->'offerings','[]')))
  on conflict do nothing;

  for r in select * from jsonb_array_elements(coalesce(payload->'credentials','[]')) loop
    if nullif(trim(r->>'name'),'') is not null then
      insert into credentials (professional_id, name, issuer, credential_ref, issued_on, expires_on)
      values (v_id, trim(r->>'name'), nullif(trim(r->>'issuer'),''), nullif(trim(r->>'credential_ref'),''),
              nullif(r->>'issued_on','')::date, nullif(r->>'expires_on','')::date);
    end if;
  end loop;

  insert into consents (professional_id, purpose, policy_version) values (v_id, 'talent_database', v_policy);
  if coalesce((payload->'consents'->>'share_with_clients')::boolean, false) then
    insert into consents (professional_id, purpose, policy_version) values (v_id, 'share_with_clients', v_policy);
  end if;

  return jsonb_build_object('ok', true);
end $$;

-- create or replace keeps the grants, but state them so this file is self-contained.
revoke all on function public.submit_application(jsonb) from public, authenticated;
grant execute on function public.submit_application(jsonb) to anon;
