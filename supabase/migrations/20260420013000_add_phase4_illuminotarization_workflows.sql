-- Phase 4: bundle-oriented illuminotarization workflow foundation layered on top of
-- legacy notarization_requests and illuminotarization_codes.

create table if not exists public.illuminotarization_workflows (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references public.users(id) on delete cascade,
  created_by_user_id uuid references public.users(id) on delete set null,
  primary_document_id uuid references public.documents(id) on delete set null,
  workflow_kind text not null default 'single_document',
  status text not null default 'draft',
  selected_notary_user_id uuid references public.users(id) on delete set null,
  assigned_notary_user_id uuid references public.users(id) on delete set null,
  current_legacy_request_id uuid references public.notarization_requests(id) on delete set null,
  submitted_at timestamptz,
  last_code_generated_at timestamptz,
  review_started_at timestamptz,
  closed_at timestamptz,
  context_json jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint illuminotarization_workflows_workflow_kind_check
    check (workflow_kind in ('single_document', 'document_bundle')),
  constraint illuminotarization_workflows_status_check
    check (
      status in (
        'draft',
        'submitted',
        'code_delivered',
        'in_review',
        'changes_requested',
        'approved',
        'rejected',
        'completed',
        'canceled',
        'expired'
      )
    )
);

create table if not exists public.illuminotarization_workflow_documents (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.illuminotarization_workflows(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  document_version_id uuid references public.document_versions(id) on delete set null,
  notarization_request_id uuid references public.notarization_requests(id) on delete set null,
  bundle_role text not null default 'primary',
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  included_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint illuminotarization_workflow_documents_bundle_role_check
    check (bundle_role in ('primary', 'bundle_member', 'attachment')),
  constraint illuminotarization_workflow_documents_sort_order_check
    check (sort_order >= 0)
);

create table if not exists public.workflow_assignments (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.illuminotarization_workflows(id) on delete cascade,
  assignment_kind text not null,
  user_id uuid not null references public.users(id) on delete cascade,
  assigned_by_user_id uuid references public.users(id) on delete set null,
  assignment_source text not null default 'system',
  status text not null default 'active',
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workflow_assignments_assignment_kind_check
    check (assignment_kind in ('selected_notary', 'assigned_notary', 'review_delegate')),
  constraint workflow_assignments_assignment_source_check
    check (assignment_source in ('member_selection', 'code_resolution', 'admin_override', 'migration', 'system')),
  constraint workflow_assignments_status_check
    check (status in ('active', 'released', 'completed', 'canceled'))
);

create table if not exists public.workflow_status_history (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.illuminotarization_workflows(id) on delete cascade,
  legacy_request_id uuid references public.notarization_requests(id) on delete set null,
  previous_status text,
  next_status text not null,
  changed_by_user_id uuid references public.users(id) on delete set null,
  change_source text not null default 'system',
  change_reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint workflow_status_history_previous_status_check
    check (
      previous_status is null
      or previous_status in (
        'draft',
        'submitted',
        'code_delivered',
        'in_review',
        'changes_requested',
        'approved',
        'rejected',
        'completed',
        'canceled',
        'expired'
      )
    ),
  constraint workflow_status_history_next_status_check
    check (
      next_status in (
        'draft',
        'submitted',
        'code_delivered',
        'in_review',
        'changes_requested',
        'approved',
        'rejected',
        'completed',
        'canceled',
        'expired'
      )
    ),
  constraint workflow_status_history_change_source_check
    check (
      change_source in (
        'workflow_create',
        'submit_notarization',
        'code_delivery',
        'code_resolution',
        'review_decision',
        'admin_override',
        'migration',
        'system'
      )
    )
);

create table if not exists public.code_deliveries (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.illuminotarization_workflows(id) on delete cascade,
  legacy_request_id uuid references public.notarization_requests(id) on delete set null,
  illuminotarization_code_id uuid references public.illuminotarization_codes(id) on delete set null,
  notification_job_id uuid references public.notification_jobs(id) on delete set null,
  previous_code_delivery_id uuid references public.code_deliveries(id) on delete set null,
  recipient_user_id uuid references public.users(id) on delete set null,
  channel text not null default 'email',
  delivery_method text not null default 'notification_outbox',
  delivery_reason text not null default 'initial_submit',
  status text not null default 'delivered',
  recipient_address text,
  code_value_snapshot text not null,
  expires_at timestamptz,
  delivered_at timestamptz,
  consumed_at timestamptz,
  invalidated_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint code_deliveries_channel_check
    check (channel in ('email', 'sms', 'in_app', 'manual')),
  constraint code_deliveries_delivery_method_check
    check (delivery_method in ('notification_outbox', 'manual_copy', 'legacy_backfill')),
  constraint code_deliveries_delivery_reason_check
    check (delivery_reason in ('initial_submit', 'resent', 'regenerated', 'manual_copy')),
  constraint code_deliveries_status_check
    check (status in ('queued', 'delivered', 'consumed', 'expired', 'revoked', 'failed')),
  constraint code_deliveries_recipient_address_check
    check (recipient_address is null or btrim(recipient_address) <> ''),
  constraint code_deliveries_code_value_snapshot_check
    check (btrim(code_value_snapshot) <> '')
);

create table if not exists public.illuminotary_review_decisions (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references public.illuminotarization_workflows(id) on delete cascade,
  legacy_request_id uuid references public.notarization_requests(id) on delete set null,
  decided_by_user_id uuid not null references public.users(id) on delete cascade,
  decision text not null,
  summary text,
  decision_notes text,
  decided_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint illuminotary_review_decisions_decision_check
    check (decision in ('approved', 'rejected', 'changes_requested')),
  constraint illuminotary_review_decisions_summary_check
    check (summary is null or btrim(summary) <> '')
);

create table if not exists public.access_code_attempts (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid references public.illuminotarization_workflows(id) on delete set null,
  legacy_request_id uuid references public.notarization_requests(id) on delete set null,
  illuminotarization_code_id uuid references public.illuminotarization_codes(id) on delete set null,
  matched_code_delivery_id uuid references public.code_deliveries(id) on delete set null,
  attempted_by_user_id uuid references public.users(id) on delete set null,
  attempt_kind text not null default 'resolve',
  attempted_code_value text not null,
  result text not null,
  result_message text,
  attempted_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint access_code_attempts_attempt_kind_check
    check (attempt_kind in ('resolve')),
  constraint access_code_attempts_attempted_code_value_check
    check (btrim(attempted_code_value) <> ''),
  constraint access_code_attempts_result_check
    check (
      result in (
        'matched',
        'not_found',
        'expired',
        'already_consumed',
        'already_assigned',
        'request_ineligible',
        'notary_mismatch',
        'request_missing'
      )
    )
);

alter table public.notarization_requests
  add column if not exists workflow_id uuid references public.illuminotarization_workflows(id) on delete set null;

alter table public.illuminotarization_codes
  add column if not exists workflow_id uuid references public.illuminotarization_workflows(id) on delete set null;

create unique index if not exists ux_illuminotarization_workflows_current_legacy_request
  on public.illuminotarization_workflows(current_legacy_request_id)
  where current_legacy_request_id is not null;

create unique index if not exists ux_illuminotarization_workflow_documents_workflow_document
  on public.illuminotarization_workflow_documents(workflow_id, document_id);

create unique index if not exists ux_illuminotarization_workflow_documents_request
  on public.illuminotarization_workflow_documents(notarization_request_id)
  where notarization_request_id is not null;

create unique index if not exists ux_illuminotarization_workflow_documents_primary
  on public.illuminotarization_workflow_documents(workflow_id)
  where is_primary = true;

create unique index if not exists ux_workflow_assignments_active_kind
  on public.workflow_assignments(workflow_id, assignment_kind)
  where status = 'active';

create index if not exists idx_illuminotarization_workflows_owner_status
  on public.illuminotarization_workflows(owner_user_id, status, created_at desc);

create index if not exists idx_illuminotarization_workflows_primary_document
  on public.illuminotarization_workflows(primary_document_id, status, created_at desc);

create index if not exists idx_illuminotarization_workflows_selected_notary
  on public.illuminotarization_workflows(selected_notary_user_id, status, created_at desc);

create index if not exists idx_illuminotarization_workflows_assigned_notary
  on public.illuminotarization_workflows(assigned_notary_user_id, status, created_at desc);

create index if not exists idx_illuminotarization_workflow_documents_document
  on public.illuminotarization_workflow_documents(document_id, included_at desc);

create index if not exists idx_workflow_assignments_user_status
  on public.workflow_assignments(user_id, status, created_at desc);

create index if not exists idx_workflow_status_history_workflow_created
  on public.workflow_status_history(workflow_id, created_at desc);

create index if not exists idx_code_deliveries_workflow_created
  on public.code_deliveries(workflow_id, created_at desc);

create index if not exists idx_code_deliveries_request_created
  on public.code_deliveries(legacy_request_id, created_at desc);

create index if not exists idx_code_deliveries_code_status
  on public.code_deliveries(illuminotarization_code_id, status, created_at desc);

create index if not exists idx_illuminotary_review_decisions_workflow
  on public.illuminotary_review_decisions(workflow_id, decided_at desc);

create index if not exists idx_access_code_attempts_workflow_attempted
  on public.access_code_attempts(workflow_id, attempted_at desc);

create index if not exists idx_access_code_attempts_code_attempted
  on public.access_code_attempts(illuminotarization_code_id, attempted_at desc);

create index if not exists idx_access_code_attempts_result_attempted
  on public.access_code_attempts(result, attempted_at desc);

create index if not exists idx_notarization_requests_workflow
  on public.notarization_requests(workflow_id);

create index if not exists idx_illuminotarization_codes_workflow
  on public.illuminotarization_codes(workflow_id);

comment on table public.illuminotarization_workflows is
'Bundle-oriented illuminotarization workflow anchor that sits above legacy notarization_requests during the Phase 4 compatibility period.';

comment on table public.illuminotarization_workflow_documents is
'Documents and optional document versions participating in a single illuminotarization workflow.';

comment on table public.workflow_assignments is
'Selected and assigned illuminotary relationships for a workflow, including compatibility with current code-resolution assignment.';

comment on table public.workflow_status_history is
'Append-only workflow state transitions kept separate from audit_events so operational workflow orchestration remains queryable.';

comment on table public.code_deliveries is
'Delivery ledger for illuminotarization codes, including resend and regeneration chains layered on top of legacy illuminotarization_codes.';

comment on table public.illuminotary_review_decisions is
'Future-proof review decisions for approve, reject, and changes-requested states within an illuminotarization workflow.';

comment on table public.access_code_attempts is
'Access attempts against illuminotarization codes, including unsuccessful resolution attempts and selected-notary mismatches.';

insert into public.illuminotarization_workflows (
  owner_user_id,
  created_by_user_id,
  primary_document_id,
  workflow_kind,
  status,
  selected_notary_user_id,
  assigned_notary_user_id,
  current_legacy_request_id,
  submitted_at,
  last_code_generated_at,
  review_started_at,
  context_json,
  metadata,
  created_at,
  updated_at
)
select
  documents.owner_id,
  documents.owner_id,
  requests.document_id,
  'single_document',
  case
    when requests.status = 'in_review' then 'in_review'
    when requests.status = 'completed' then 'completed'
    when requests.status = 'rejected' then 'rejected'
    when requests.status = 'pending' and latest_code.status in ('active', 'resent', 'regenerated') then 'code_delivered'
    when requests.status = 'pending' and latest_code.status = 'expired' then 'expired'
    else 'submitted'
  end,
  null,
  requests.assigned_notary_id,
  requests.id,
  requests.submitted_at,
  latest_code.created_at,
  case
    when requests.status = 'in_review' then coalesce(latest_code.consumed_at, requests.submitted_at, requests.created_at)
    else null
  end,
  jsonb_build_object('backfilled', true, 'legacy_request_id', requests.id),
  jsonb_build_object('source', 'phase4_backfill'),
  requests.created_at,
  now()
from public.notarization_requests requests
join public.documents on public.documents.id = requests.document_id
left join lateral (
  select
    codes.id,
    codes.status,
    codes.created_at,
    codes.consumed_at
  from public.illuminotarization_codes codes
  where codes.request_id = requests.id
  order by codes.created_at desc
  limit 1
) latest_code on true
where requests.workflow_id is null
  and not exists (
    select 1
    from public.illuminotarization_workflows existing
    where existing.current_legacy_request_id = requests.id
  );

insert into public.illuminotarization_workflow_documents (
  workflow_id,
  document_id,
  notarization_request_id,
  bundle_role,
  is_primary,
  sort_order,
  metadata,
  included_at,
  created_at,
  updated_at
)
select
  workflows.id,
  requests.document_id,
  requests.id,
  'primary',
  true,
  0,
  jsonb_build_object('source', 'phase4_backfill'),
  requests.created_at,
  requests.created_at,
  now()
from public.notarization_requests requests
join public.illuminotarization_workflows workflows
  on workflows.current_legacy_request_id = requests.id
where not exists (
  select 1
  from public.illuminotarization_workflow_documents workflow_documents
  where workflow_documents.notarization_request_id = requests.id
);

update public.notarization_requests requests
set workflow_id = workflows.id
from public.illuminotarization_workflows workflows
where workflows.current_legacy_request_id = requests.id
  and requests.workflow_id is null;

update public.illuminotarization_codes codes
set workflow_id = requests.workflow_id
from public.notarization_requests requests
where requests.id = codes.request_id
  and codes.workflow_id is null
  and requests.workflow_id is not null;

insert into public.workflow_assignments (
  workflow_id,
  assignment_kind,
  user_id,
  assignment_source,
  status,
  started_at,
  metadata,
  created_at,
  updated_at
)
select
  requests.workflow_id,
  'assigned_notary',
  requests.assigned_notary_id,
  'migration',
  case
    when requests.status in ('completed', 'rejected') then 'completed'
    else 'active'
  end,
  coalesce(requests.submitted_at, requests.created_at),
  jsonb_build_object('source', 'phase4_backfill'),
  requests.created_at,
  now()
from public.notarization_requests requests
where requests.workflow_id is not null
  and requests.assigned_notary_id is not null
  and not exists (
    select 1
    from public.workflow_assignments assignments
    where assignments.workflow_id = requests.workflow_id
      and assignments.assignment_kind = 'assigned_notary'
      and assignments.user_id = requests.assigned_notary_id
  );

insert into public.workflow_status_history (
  workflow_id,
  legacy_request_id,
  previous_status,
  next_status,
  change_source,
  change_reason,
  metadata,
  created_at
)
select
  workflows.id,
  workflows.current_legacy_request_id,
  null,
  workflows.status,
  'migration',
  'Backfilled from legacy notarization request state during Phase 4 rollout',
  jsonb_build_object('source', 'phase4_backfill'),
  workflows.created_at
from public.illuminotarization_workflows workflows
where not exists (
  select 1
  from public.workflow_status_history history
  where history.workflow_id = workflows.id
);

insert into public.code_deliveries (
  workflow_id,
  legacy_request_id,
  illuminotarization_code_id,
  recipient_user_id,
  channel,
  delivery_method,
  delivery_reason,
  status,
  recipient_address,
  code_value_snapshot,
  expires_at,
  delivered_at,
  consumed_at,
  invalidated_at,
  metadata,
  created_at,
  updated_at
)
select
  workflows.id,
  requests.id,
  codes.id,
  workflows.owner_user_id,
  'email',
  'legacy_backfill',
  case
    when codes.status = 'resent' then 'resent'
    when codes.status = 'regenerated' then 'regenerated'
    else 'initial_submit'
  end,
  case
    when codes.status = 'consumed' then 'consumed'
    when codes.status = 'expired' then 'expired'
    when codes.status = 'revoked' then 'revoked'
    when codes.status in ('active', 'resent', 'regenerated') then 'delivered'
    else 'failed'
  end,
  owner.email,
  codes.code,
  codes.expires_at,
  codes.created_at,
  codes.consumed_at,
  case
    when codes.status in ('expired', 'revoked') then coalesce(codes.expires_at, codes.created_at)
    else null
  end,
  jsonb_build_object('source', 'phase4_backfill'),
  codes.created_at,
  now()
from public.illuminotarization_codes codes
join public.notarization_requests requests on requests.id = codes.request_id
join public.illuminotarization_workflows workflows on workflows.id = requests.workflow_id
left join public.users owner on owner.id = workflows.owner_user_id
where not exists (
  select 1
  from public.code_deliveries deliveries
  where deliveries.illuminotarization_code_id = codes.id
    and deliveries.delivery_reason = case
      when codes.status = 'resent' then 'resent'
      when codes.status = 'regenerated' then 'regenerated'
      else 'initial_submit'
    end
    and deliveries.delivered_at = codes.created_at
);

create or replace function public.illuminotarization_workflow_visible_to_auth(target_workflow_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.illuminotarization_workflows workflows
    where workflows.id = target_workflow_id
      and (
        public.auth_user_matches(workflows.owner_user_id)
        or public.auth_user_matches(workflows.created_by_user_id)
        or public.auth_user_matches(workflows.selected_notary_user_id)
        or public.auth_user_matches(workflows.assigned_notary_user_id)
        or public.document_owned_by_auth(workflows.primary_document_id)
        or exists (
          select 1
          from public.illuminotarization_workflow_documents workflow_documents
          where workflow_documents.workflow_id = workflows.id
            and public.document_owned_by_auth(workflow_documents.document_id)
        )
        or exists (
          select 1
          from public.workflow_assignments assignments
          where assignments.workflow_id = workflows.id
            and public.auth_user_matches(assignments.user_id)
        )
      )
  );
$$;

alter table public.illuminotarization_workflows enable row level security;
alter table public.illuminotarization_workflow_documents enable row level security;
alter table public.workflow_assignments enable row level security;
alter table public.workflow_status_history enable row level security;
alter table public.code_deliveries enable row level security;
alter table public.illuminotary_review_decisions enable row level security;
alter table public.access_code_attempts enable row level security;

drop policy if exists "illuminotarization_workflows_select_visible" on public.illuminotarization_workflows;
create policy "illuminotarization_workflows_select_visible" on public.illuminotarization_workflows
  for select using (public.illuminotarization_workflow_visible_to_auth(id));

drop policy if exists "illuminotarization_workflows_service_role_access" on public.illuminotarization_workflows;
create policy "illuminotarization_workflows_service_role_access" on public.illuminotarization_workflows
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "illuminotarization_workflow_documents_select_visible" on public.illuminotarization_workflow_documents;
create policy "illuminotarization_workflow_documents_select_visible" on public.illuminotarization_workflow_documents
  for select using (public.illuminotarization_workflow_visible_to_auth(workflow_id));

drop policy if exists "illuminotarization_workflow_documents_service_role_access" on public.illuminotarization_workflow_documents;
create policy "illuminotarization_workflow_documents_service_role_access" on public.illuminotarization_workflow_documents
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "workflow_assignments_select_visible" on public.workflow_assignments;
create policy "workflow_assignments_select_visible" on public.workflow_assignments
  for select using (
    public.auth_user_matches(user_id)
    or public.illuminotarization_workflow_visible_to_auth(workflow_id)
  );

drop policy if exists "workflow_assignments_service_role_access" on public.workflow_assignments;
create policy "workflow_assignments_service_role_access" on public.workflow_assignments
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "workflow_status_history_select_visible" on public.workflow_status_history;
create policy "workflow_status_history_select_visible" on public.workflow_status_history
  for select using (public.illuminotarization_workflow_visible_to_auth(workflow_id));

drop policy if exists "workflow_status_history_service_role_access" on public.workflow_status_history;
create policy "workflow_status_history_service_role_access" on public.workflow_status_history
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "code_deliveries_select_visible" on public.code_deliveries;
create policy "code_deliveries_select_visible" on public.code_deliveries
  for select using (
    public.auth_user_matches(recipient_user_id)
    or public.illuminotarization_workflow_visible_to_auth(workflow_id)
  );

drop policy if exists "code_deliveries_service_role_access" on public.code_deliveries;
create policy "code_deliveries_service_role_access" on public.code_deliveries
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "illuminotary_review_decisions_select_visible" on public.illuminotary_review_decisions;
create policy "illuminotary_review_decisions_select_visible" on public.illuminotary_review_decisions
  for select using (
    public.auth_user_matches(decided_by_user_id)
    or public.illuminotarization_workflow_visible_to_auth(workflow_id)
  );

drop policy if exists "illuminotary_review_decisions_service_role_access" on public.illuminotary_review_decisions;
create policy "illuminotary_review_decisions_service_role_access" on public.illuminotary_review_decisions
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "access_code_attempts_select_visible" on public.access_code_attempts;
create policy "access_code_attempts_select_visible" on public.access_code_attempts
  for select using (
    public.auth_user_matches(attempted_by_user_id)
    or (workflow_id is not null and public.illuminotarization_workflow_visible_to_auth(workflow_id))
  );

drop policy if exists "access_code_attempts_service_role_access" on public.access_code_attempts;
create policy "access_code_attempts_service_role_access" on public.access_code_attempts
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

grant select on table public.illuminotarization_workflows to authenticated;
grant select on table public.illuminotarization_workflow_documents to authenticated;
grant select on table public.workflow_assignments to authenticated;
grant select on table public.workflow_status_history to authenticated;
grant select on table public.code_deliveries to authenticated;
grant select on table public.illuminotary_review_decisions to authenticated;
grant select on table public.access_code_attempts to authenticated;

drop trigger if exists trg_illuminotarization_workflows_touch_updated_at on public.illuminotarization_workflows;
create trigger trg_illuminotarization_workflows_touch_updated_at
before update on public.illuminotarization_workflows
for each row execute function public.touch_updated_at();

drop trigger if exists trg_illuminotarization_workflow_documents_touch_updated_at on public.illuminotarization_workflow_documents;
create trigger trg_illuminotarization_workflow_documents_touch_updated_at
before update on public.illuminotarization_workflow_documents
for each row execute function public.touch_updated_at();

drop trigger if exists trg_workflow_assignments_touch_updated_at on public.workflow_assignments;
create trigger trg_workflow_assignments_touch_updated_at
before update on public.workflow_assignments
for each row execute function public.touch_updated_at();

drop trigger if exists trg_code_deliveries_touch_updated_at on public.code_deliveries;
create trigger trg_code_deliveries_touch_updated_at
before update on public.code_deliveries
for each row execute function public.touch_updated_at();