-- Simplify Notarize a Document into an upload-backed intake instead of a POA form.

with notarize_mode as (
  select id
  from public.product_flow_modes
  where mode_key = 'notarize_document'
)
update public.product_flow_modes
set
  description = 'Upload an existing PDF and collect requester contact details for the notarization workflow.',
  updated_at = now()
where mode_key = 'notarize_document';

with notarize_mode as (
  select id
  from public.product_flow_modes
  where mode_key = 'notarize_document'
)
delete from public.product_flow_mode_families families
using notarize_mode
where families.mode_id = notarize_mode.id;

with notarize_mode as (
  select id
  from public.product_flow_modes
  where mode_key = 'notarize_document'
)
delete from public.product_flow_mode_outputs outputs
using notarize_mode
where outputs.mode_id = notarize_mode.id;

with notarize_mode as (
  select id
  from public.product_flow_modes
  where mode_key = 'notarize_document'
)
delete from public.product_flow_mode_ui ui
using notarize_mode
where ui.mode_id = notarize_mode.id
  and ui.group_key <> 'general_information';

insert into public.product_flow_mode_ui (
  mode_id,
  group_key,
  layout_mode,
  show_upload_column,
  upload_required,
  sort_order,
  metadata
)
select
  mode.id,
  'general_information',
  'wizard-step',
  false,
  false,
  10,
  jsonb_build_object('surface', 'notarize_document_upload')
from public.product_flow_modes mode
where mode.mode_key = 'notarize_document'
on conflict (mode_id, group_key)
do update set
  layout_mode = excluded.layout_mode,
  show_upload_column = excluded.show_upload_column,
  upload_required = excluded.upload_required,
  sort_order = excluded.sort_order,
  metadata = excluded.metadata,
  updated_at = now();