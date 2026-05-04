-- =========================================================================
-- Wheel Tracker v2 — initial schema
-- =========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "moddatetime" schema extensions;

-- ----- Enums --------------------------------------------------------------
create type trade_action as enum ('sell', 'buy', 'assignment', 'called-away');
create type trade_type   as enum ('put', 'call', 'stock');
create type trade_status as enum ('open', 'closed', 'assigned');
create type stock_status as enum ('holding', 'called-away');
create type theme_pref   as enum ('dark', 'light');

-- ----- custom_accounts ----------------------------------------------------
create table public.custom_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index custom_accounts_user_idx on public.custom_accounts(user_id);

-- ----- trades -------------------------------------------------------------
create table public.trades (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  trade_ref           text,
  account             text,
  symbol              text not null,
  contracts           int  not null default 1 check (contracts > 0),
  strike              numeric(14,4),
  premium             numeric(14,4) not null default 0,
  action              trade_action  not null,
  type                trade_type    not null,
  date_opened         date not null,
  date_closed         date,
  exp_date            date,
  price_at_action     numeric(14,4),
  info                text,
  status              trade_status  not null default 'open',
  close_price         numeric(14,4),
  closing_notes       text,
  is_closing_trade    boolean not null default false,
  is_rolled           boolean not null default false,
  is_covered_call     boolean not null default false,
  is_assignment       boolean not null default false,
  is_called_away      boolean not null default false,
  linked_stock_id     uuid,
  assigned_price      numeric(14,4),
  full_cycle_pl       numeric(14,4),
  cycle_details       jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index trades_user_symbol_idx   on public.trades(user_id, symbol);
create index trades_user_status_idx   on public.trades(user_id, status);
create index trades_user_traderef_idx on public.trades(user_id, trade_ref);
create index trades_user_exp_idx      on public.trades(user_id, exp_date);
create index trades_linked_stock_idx  on public.trades(linked_stock_id);

create trigger trades_set_updated
  before update on public.trades
  for each row execute procedure extensions.moddatetime(updated_at);

-- Normalize symbol to uppercase on every write. Null-safe so it can be reused
-- on future tables where symbol may be nullable.
create function public.uppercase_symbol() returns trigger
language plpgsql as $$
begin
  if new.symbol is not null then
    new.symbol := upper(new.symbol);
  end if;
  return new;
end $$;

create trigger trades_uppercase_symbol
  before insert or update on public.trades
  for each row execute procedure public.uppercase_symbol();

-- ----- stock_positions ----------------------------------------------------
create table public.stock_positions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references auth.users(id) on delete cascade,
  symbol          text not null,
  shares          int  not null check (shares > 0),
  cost_basis      numeric(14,4) not null,
  assigned_price  numeric(14,4) not null,
  total_cost      numeric(14,4) not null,
  total_value     numeric(14,4) not null,
  assigned_date   date not null,
  original_put_id uuid references public.trades(id) on delete set null,
  original_put    jsonb not null,            -- denormalized snapshot, see spec
  covered_calls   jsonb not null default '[]'::jsonb,
  account         text,
  trade_ref       text,
  status          stock_status not null default 'holding',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index stock_positions_user_symbol_idx   on public.stock_positions(user_id, symbol);
create index stock_positions_user_traderef_idx on public.stock_positions(user_id, trade_ref);

create trigger stock_positions_set_updated
  before update on public.stock_positions
  for each row execute procedure extensions.moddatetime(updated_at);

create trigger stock_positions_uppercase_symbol
  before insert or update on public.stock_positions
  for each row execute procedure public.uppercase_symbol();

-- Now that stock_positions exists, add the FK back from trades.linked_stock_id.
alter table public.trades
  add constraint trades_linked_stock_fk
  foreign key (linked_stock_id) references public.stock_positions(id)
  on delete set null;

-- ----- trade_groups -------------------------------------------------------
create table public.trade_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  trade_ids   uuid[] not null default '{}',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);
create index trade_groups_user_idx      on public.trade_groups(user_id);
create index trade_groups_trade_ids_gin on public.trade_groups using gin (trade_ids);

create trigger trade_groups_set_updated
  before update on public.trade_groups
  for each row execute procedure extensions.moddatetime(updated_at);

-- ----- user_preferences ---------------------------------------------------
create table public.user_preferences (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  theme       theme_pref not null default 'dark',
  updated_at  timestamptz not null default now()
);

create trigger user_preferences_set_updated
  before update on public.user_preferences
  for each row execute procedure extensions.moddatetime(updated_at);

-- ----- New-user seeding ---------------------------------------------------
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.user_preferences(user_id) values (new.id);
  insert into public.custom_accounts(user_id, name) values
    (new.id, 'Main'), (new.id, 'IRA'), (new.id, 'Roth IRA');
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.trades            enable row level security;
alter table public.stock_positions   enable row level security;
alter table public.trade_groups      enable row level security;
alter table public.custom_accounts   enable row level security;
alter table public.user_preferences  enable row level security;

-- Same four-policy shape on every table.
do $$
declare t text;
begin
  foreach t in array array[
    'trades','stock_positions','trade_groups','custom_accounts','user_preferences'
  ] loop
    execute format($f$
      create policy "%1$s_select" on public.%1$s
        for select using (auth.uid() = user_id);
      create policy "%1$s_insert" on public.%1$s
        for insert with check (auth.uid() = user_id);
      create policy "%1$s_update" on public.%1$s
        for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
      create policy "%1$s_delete" on public.%1$s
        for delete using (auth.uid() = user_id);
    $f$, t);
  end loop;
end $$;
