-- ============================================================================
-- A minimal stand-in for the parts of Supabase the migrations rely on, so the
-- SQL tests can run against a plain PostgreSQL 16 instance with no Supabase
-- project, no network, and no keys.
--
-- ONLY for local verification. Never apply this to a Supabase project — every
-- object here already exists there, generally with more to it.
--
-- What it provides:
--   * the `anon`, `authenticated` and `service_role` roles
--   * `auth.users`, and `auth.uid()` reading request.jwt.claims exactly as
--     Supabase's does
--   * `storage.buckets`, `storage.objects` and `storage.foldername`
--
-- See scripts/run-sql-tests.sh, which applies this, then the four migrations,
-- then the tests.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end;
$$;

create schema if not exists auth;
create schema if not exists storage;

grant usage on schema public to anon, authenticated, service_role;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema storage to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key,
  instance_id uuid,
  aud text,
  role text,
  email text
);

-- Matches Supabase's definition: the subject claim of the request's JWT, or
-- null when there is no authenticated caller.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid
$$;

grant execute on function auth.uid() to anon, authenticated, service_role;

create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint
);

create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text not null,
  owner uuid,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

-- Splits an object key on "/" and returns the leading path segments. The portal
-- storage policies read element [1] as the project id.
create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare parts text[];
begin
  parts := string_to_array(name, '/');
  return parts[1:array_length(parts, 1) - 1];
end;
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select, insert, delete on storage.objects to authenticated;
