-- ════════════════════════════════════════════════════════════════
-- 유전자 분석 플랫폼 · Supabase 스키마
-- 사용법: Supabase 대시보드 > SQL Editor 에 붙여넣고 "Run"
-- ════════════════════════════════════════════════════════════════

-- 상담 기록 테이블
create table if not exists public.consultations (
  id            uuid primary key default gen_random_uuid(),
  consultant_id uuid not null references auth.users(id) on delete cascade,
  client_alias  text not null default '고객',        -- 고객 가명 (실명 저장 지양)
  client_info   text default '',                      -- 성별/연령대 등
  client_note   text default '',                      -- 상담 메모
  gene_states   jsonb not null default '{}'::jsonb,   -- { "APOE": "HOMO", ... }
  mutation_count int not null default 0,              -- 변이 개수(목록 표시용)
  ai_report     text default '',                      -- Gemini 생성 리포트(마크다운)
  ai_model      text default '',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists consultations_consultant_created_idx
  on public.consultations (consultant_id, created_at desc);

-- updated_at 자동 갱신
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end; $$;

drop trigger if exists trg_consultations_touch on public.consultations;
create trigger trg_consultations_touch
  before update on public.consultations
  for each row execute function public.touch_updated_at();

-- ── 행 단위 보안(RLS): 상담사는 "본인" 기록만 접근 ──────────────
alter table public.consultations enable row level security;

drop policy if exists "own_select" on public.consultations;
create policy "own_select" on public.consultations
  for select using (auth.uid() = consultant_id);

drop policy if exists "own_insert" on public.consultations;
create policy "own_insert" on public.consultations
  for insert with check (auth.uid() = consultant_id);

drop policy if exists "own_update" on public.consultations;
create policy "own_update" on public.consultations
  for update using (auth.uid() = consultant_id) with check (auth.uid() = consultant_id);

drop policy if exists "own_delete" on public.consultations;
create policy "own_delete" on public.consultations
  for delete using (auth.uid() = consultant_id);

-- ════════════════════════════════════════════════════════════════
-- ⚠️ 민감정보 참고:
--  gene_states/ai_report 는 건강·유전정보(민감정보)입니다.
--  Supabase 는 저장 데이터를 암호화(at rest)하지만, 실제 서비스에서는
--  수집·이용 동의, 보관기간, 접근 로그 등 추가 조치를 검토하세요.
-- ════════════════════════════════════════════════════════════════
