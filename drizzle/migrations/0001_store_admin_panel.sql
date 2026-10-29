create table public.leads (
  id uuid primary key default gen_random_uuid(),
  name text not null, phone text, email text, ip text, city text, country text,
  user_agent text, referrer text, utm_source text, utm_medium text, utm_campaign text,
  created_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  ip text, user_agent text, referrer text, current_page text,
  utm_source text, utm_medium text, utm_campaign text,
  started_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create index on public.sessions (last_seen_at desc);
create index on public.sessions (lead_id);
create table public.events (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  lead_id uuid references public.leads(id) on delete set null,
  session_id uuid references public.sessions(id) on delete set null,
  page text, value_cents integer, data jsonb,
  created_at timestamptz not null default now()
);
create index on public.events (created_at desc);
create index on public.events (lead_id);
create index on public.events (session_id);
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  customer_name text, customer_phone text, customer_email text,
  items jsonb not null default '[]'::jsonb,
  total_cents integer not null default 0,
  status text not null default 'pending' check (status in ('pending','paid','cancelled','refunded')),
  payment_method text not null default 'pix',
  confirmed_by text check (confirmed_by in ('gateway','manual')),
  coupon_code text, tracking jsonb not null default '{}'::jsonb, notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index on public.orders (created_at desc);
create trigger orders_touch before update on public.orders for each row execute function public.touch_updated_at();
create table public.visitor_ips (
  id uuid primary key default gen_random_uuid(),
  ip text unique not null, name text, visit_count integer not null default 1,
  first_page text, last_page text, user_agent text,
  geo_country text, geo_country_code text, geo_region text, geo_city text,
  geo_lat double precision, geo_lon double precision, geo_org text,
  is_vpn boolean default false, is_proxy boolean default false, is_tor boolean default false,
  is_datacenter boolean default false, is_virtual boolean default false, tz_mismatch boolean default false,
  fp_hash text, fp_timezone text, fp_lang text, fp_screen text, fp_platform text, fp_gpu text,
  blocked boolean not null default false, permanent_block boolean not null default false,
  blocked_at timestamptz, blocked_reason text, notes text,
  first_seen_at timestamptz not null default now(), last_seen_at timestamptz not null default now()
);
create index on public.visitor_ips (last_seen_at desc);
create table public.banned_ips (
  id uuid primary key default gen_random_uuid(),
  ip text unique not null, reason text not null, attack_type text,
  attack_count integer not null default 1, severity text default 'medium',
  user_agent text, sample_payload text, notes text,
  geo_country text, geo_city text, geo_org text,
  permanent_block boolean not null default false,
  reviewed boolean not null default false, unbanned boolean not null default false,
  banned_at timestamptz not null default now(), last_attack_at timestamptz not null default now()
);
create table public.attack_log (
  id uuid primary key default gen_random_uuid(),
  ip text, attack_type text not null, rule_matched text,
  severity text not null default 'medium', blocked boolean not null default true,
  method text, url text, payload_preview text,
  created_at timestamptz not null default now()
);
create index on public.attack_log (created_at desc);
create table public.logs (
  id uuid primary key default gen_random_uuid(),
  action text not null, name text, phone text, destination_phone text,
  ip text, geo_city text, geo_country text, page text, user_agent text,
  suspicious boolean not null default false, notes text, extra jsonb,
  created_at timestamptz not null default now()
);
create index on public.logs (created_at desc);
create table public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text unique not null check (code = upper(code)),
  percent numeric not null check (percent > 0 and percent <= 100),
  min_value_cents integer not null default 0,
  active boolean not null default true, expires_at timestamptz,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.leads, public.sessions, public.events, public.orders,
  public.visitor_ips, public.banned_ips, public.attack_log, public.logs, public.coupons to authenticated;
grant all on public.leads, public.sessions, public.events, public.orders,
  public.visitor_ips, public.banned_ips, public.attack_log, public.logs, public.coupons to service_role;

alter table public.leads enable row level security;
alter table public.sessions enable row level security;
alter table public.events enable row level security;
alter table public.orders enable row level security;
alter table public.visitor_ips enable row level security;
alter table public.banned_ips enable row level security;
alter table public.attack_log enable row level security;
alter table public.logs enable row level security;
alter table public.coupons enable row level security;

create policy "members all" on public.leads for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.sessions for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.events for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.orders for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.visitor_ips for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.banned_ips for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.attack_log for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.logs for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.coupons for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));