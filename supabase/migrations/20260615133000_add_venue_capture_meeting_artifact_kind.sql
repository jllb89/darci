alter table public.meeting_artifacts
  drop constraint if exists meeting_artifacts_artifact_kind_check;

alter table public.meeting_artifacts
  add constraint meeting_artifacts_artifact_kind_check
  check (
    artifact_kind in (
      'identity_document',
      'identity_selfie',
      'consent_capture',
      'location_photo',
      'venue_capture',
      'verification_summary',
      'seal_preview',
      'meeting_note',
      'other'
    )
  );