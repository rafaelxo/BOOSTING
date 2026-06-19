-- Booster applications table (public form at /apply)
create table if not exists booster_applications (
  id               uuid primary key default gen_random_uuid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  -- optionally linked to an existing user account
  user_id          uuid references profiles(id) on delete set null,

  -- account info
  summoner_name    text not null,
  opgg_link        text,
  region           text not null,
  peak_rank        text not null,

  -- play style
  roles            text[] not null default '{}',
  games            text[] not null default '{}',
  has_coaching     boolean not null default false,

  -- availability
  available_days   text[] not null default '{}',
  hours_per_week   int not null,

  -- about
  years_experience numeric(4,1) not null,
  discord_tag      text,
  motivation       text not null,

  -- review
  status           text not null default 'pending'
                   check (status in ('pending', 'under_review', 'accepted', 'rejected')),
  admin_notes      text
);

-- Updated_at trigger
create or replace function update_booster_applications_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_booster_applications_updated_at on booster_applications;

create trigger set_booster_applications_updated_at
  before update on booster_applications
  for each row execute procedure update_booster_applications_updated_at();

-- RLS: anyone can INSERT (public form); only admins can read/update
alter table booster_applications enable row level security;

drop policy if exists "Anyone can submit an application" on booster_applications;
create policy "Anyone can submit an application"
  on booster_applications for insert
  with check (true);

drop policy if exists "Admins can manage applications" on booster_applications;
create policy "Admins can manage applications"
  on booster_applications for all
  using (
    exists (
      select 1 from profiles
      where profiles.id = auth.uid()
        and profiles.role in ('admin', 'support')
    )
  );

-- Index for admin queries
create index if not exists booster_applications_status_idx on booster_applications(status);
create index if not exists booster_applications_created_at_idx on booster_applications(created_at desc);
