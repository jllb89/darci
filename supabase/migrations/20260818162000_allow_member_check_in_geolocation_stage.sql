alter table public.geolocation_samples
  drop constraint if exists geolocation_samples_capture_stage_check;

alter table public.geolocation_samples
  add constraint geolocation_samples_capture_stage_check
    check (
      capture_stage in (
        'checkin',
        'member_check_in',
        'checkin_confirmation',
        'proximity_validation',
        'meeting_start',
        'meeting_end'
      )
    );
