-- Calendar tasks/events + email reminder tracking (run in Supabase SQL editor if upgrading an existing DB)
alter table public.tasks add column if not exists kind text not null default 'task';
alter table public.tasks add column if not exists reminder_1h_sent boolean not null default false;
alter table public.tasks add column if not exists reminder_10m_sent boolean not null default false;

update public.tasks set kind = 'task' where kind is null or kind not in ('task', 'event');

alter table public.tasks drop constraint if exists tasks_kind_check;
alter table public.tasks add constraint tasks_kind_check check (kind in ('task', 'event'));
