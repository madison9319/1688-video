-- ═══════════════════════════════════════════════════════════
-- 1688影片工廠：資料庫結構（在共用的 Supabase 專案 SQL Editor 整份執行一次；全部 vf_ 前綴）
-- 所有資料表都開 RLS 且不開任何 policy → 只有伺服器（service role）能讀寫，
-- 瀏覽器端拿不到也改不了任何資料。
-- ═══════════════════════════════════════════════════════════

create extension if not exists pgcrypto;

-- 後台管理員（第一次開 /admin/login 會請你建立帳號）
create table if not exists vf_admins (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

-- 會員（團隊成員，由後台建立帳號，不開放自己註冊）
-- points：剩餘點數（1 點＝NT$1，可以有小數，例如配音 0.6 點）
create table if not exists vf_members (
  id uuid primary key default gen_random_uuid(),
  username text unique not null,
  password_hash text not null,
  name text not null,
  note text,
  points numeric(12,2) not null default 0 check (points >= 0),
  status text not null default 'active' check (status in ('active','disabled')),
  last_login_at timestamptz,
  created_at timestamptz not null default now()
);

-- 點數明細（每一筆加點、扣點都記一筆，不能改不能刪）
-- kind：admin_add 後台加點 / admin_deduct 後台扣點 / usage AI 使用扣點 / refund 失敗退點
-- cost_twd：這筆實際付給 AI 平台的成本（台幣，給後台看用量）
create table if not exists vf_point_ledger (
  id bigint generated always as identity primary key,
  member_id uuid not null references vf_members(id) on delete cascade,
  delta numeric(12,2) not null,
  balance_after numeric(12,2) not null,
  kind text not null check (kind in ('admin_add','admin_deduct','usage','refund')),
  reason text not null,
  meta jsonb not null default '{}',
  cost_twd numeric(12,2),
  admin_id uuid references vf_admins(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists vf_point_ledger_member_idx on vf_point_ledger (member_id, created_at desc);
create index if not exists vf_point_ledger_created_idx on vf_point_ledger (created_at desc);

-- 系統設定（匯率、加速器下載網址…）
create table if not exists vf_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
insert into vf_settings (key, value) values
  ('usd_to_twd', '32'),
  ('cny_to_twd', '4.5'),
  ('point_rate', '1'),
  ('accelerator_url', '""'),
  ('accelerator_version', '"1.0.0"')
on conflict (key) do nothing;

-- 加點／扣點（一次完成，不會兩個人同時扣到變負數）
-- 扣點後餘額不夠 → 丟出錯誤 'INSUFFICIENT_POINTS'，什麼都不會改
create or replace function vf_adjust_points(
  p_member uuid, p_delta numeric, p_kind text, p_reason text,
  p_meta jsonb default '{}', p_cost_twd numeric default null, p_admin uuid default null
) returns numeric
language plpgsql
as $$
declare
  new_balance numeric;
begin
  update vf_members
     set points = points + p_delta
   where id = p_member and points + p_delta >= 0
  returning points into new_balance;

  if new_balance is null then
    if not exists (select 1 from vf_members where id = p_member) then
      raise exception 'MEMBER_NOT_FOUND';
    end if;
    raise exception 'INSUFFICIENT_POINTS';
  end if;

  insert into vf_point_ledger (member_id, delta, balance_after, kind, reason, meta, cost_twd, admin_id)
  values (p_member, p_delta, new_balance, p_kind, p_reason, coalesce(p_meta, '{}'), p_cost_twd, p_admin);

  return new_balance;
end;
$$;
revoke all on function vf_adjust_points(uuid, numeric, text, text, jsonb, numeric, uuid) from public, anon, authenticated;

alter table vf_admins enable row level security;
alter table vf_members enable row level security;
alter table vf_point_ledger enable row level security;
alter table vf_settings enable row level security;
