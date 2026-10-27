-- ═══════════════════════════════════════════════════════════
-- 1688影片工廠 第四階段：萬相短劇的「生成工作」紀錄（vf_ 前綴，整份執行一次）
-- 萬相做一支影片要好幾分鐘：送出時先扣點、記一筆；失敗才退點，而且只會退一次。
-- ═══════════════════════════════════════════════════════════

create table if not exists vf_jobs (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references vf_members(id) on delete cascade,
  kind text not null default 'wan',
  provider_task_id text,
  points numeric(12,2) not null,
  cost_twd numeric(12,2),
  status text not null default 'pending' check (status in ('pending','succeeded','failed','refunded')),
  result_url text,
  error text,
  meta jsonb not null default '{}',
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists vf_jobs_member_idx on vf_jobs (member_id, created_at desc);

alter table vf_jobs enable row level security;
