create table public.god_sessions (
  id uuid primary key default gen_random_uuid(),
  session_id text unique not null,
  name text, phone text, ip text, user_agent text, current_page text,
  locked boolean not null default false,
  mirror_on boolean not null default false,
  admin_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);
create index on public.god_sessions (last_seen_at desc);
create table public.god_messages (
  id uuid primary key default gen_random_uuid(),
  session_id text not null,
  sender text not null check (sender in ('admin','user')),
  text text not null,
  created_at timestamptz not null default now()
);
create index on public.god_messages (session_id, created_at);
grant select, insert, update, delete on public.god_sessions, public.god_messages to authenticated;
grant all on public.god_sessions, public.god_messages to service_role;
alter table public.god_sessions enable row level security;
alter table public.god_messages enable row level security;
create policy "members all" on public.god_sessions for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
create policy "members all" on public.god_messages for all to authenticated using (public.is_member(auth.uid())) with check (public.is_member(auth.uid()));
alter publication supabase_realtime add table public.god_sessions;
alter publication supabase_realtime add table public.god_messages;