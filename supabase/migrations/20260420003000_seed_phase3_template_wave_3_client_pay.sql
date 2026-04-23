-- Phase 3 wave 3: extend notification template coverage to client-pay billing invites and payment-request notices.

insert into public.notification_templates (
  template_key,
  template_version,
  locale,
  channel,
  template_kind,
  audience_scope,
  trigger_event,
  invite_kind,
  subject_template,
  body_template,
  body_format,
  variables_schema,
  is_active,
  source_reference,
  metadata,
  created_at,
  updated_at
)
values
  (
    'client_payment_request_invitation_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'invite',
    'client',
    'billing.payment_request_sent',
    'client_payment',
    'Payment needed to continue {{documentName}}',
    $$Hi {{firstName}},

{{requesterName}} sent you a DARCi payment request for {{documentName}}.

Amount due: {{amountDisplay}}

Please review the request and submit payment here:
{{paymentUrl}}

If you do not already have a DARCi account, we will guide you through a short setup before checkout.

This request is due by {{dueAt}}.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'requesterName', 'documentName', 'amountDisplay', 'paymentUrl', 'dueAt'),
      'optional', jsonb_build_array('dashboardUrl'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  ),
  (
    'client_payment_request_signup_required_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'invite',
    'client',
    'billing.payment_request_signup_required',
    'client_payment',
    'Finish setting up your DARCi account to review and pay',
    $$Hi {{firstName}},

Before you can review the DARCi payment request shared with you, please finish setting up your account.

Complete setup here:
{{signupUrl}}

Once you are done, we will bring you straight back to the payment review flow.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'signupUrl'),
      'optional', jsonb_build_array('documentName', 'requesterName'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  ),
  (
    'client_payment_request_reminder_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'reminder',
    'client',
    'billing.payment_request_reminder',
    'client_payment',
    'Reminder: payment is still pending for {{documentName}}',
    $$Hi {{firstName}},

This is a quick reminder that payment is still pending for {{documentName}}.

Amount due: {{amountDisplay}}

You can review the request and pay here:
{{paymentUrl}}

If you already completed this step, you can ignore this message.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'amountDisplay', 'paymentUrl'),
      'optional', jsonb_build_array('dueAt'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  ),
  (
    'client_payment_request_paid_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'billing',
    'client',
    'billing.payment_request_paid',
    null,
    'Your DARCi payment has been received',
    $$Hi {{firstName}},

We have received your payment for {{documentName}}.

Amount received: {{amountDisplay}}

You can review the latest status here:
{{dashboardUrl}}

Thank you for completing this step.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'amountDisplay', 'dashboardUrl'),
      'optional', jsonb_build_array('receiptUrl'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  ),
  (
    'client_payment_request_expired_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'billing',
    'client',
    'billing.payment_request_expired',
    null,
    'Your DARCi payment request expired',
    $$Hi {{firstName}},

The payment request for {{documentName}} has expired before payment was completed.

If you still need to continue, please contact {{requesterName}} or return to your dashboard for the latest status:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'documentName', 'requesterName', 'dashboardUrl'),
      'optional', jsonb_build_array('amountDisplay'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  ),
  (
    'pro_client_payment_request_sent_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'billing',
    'registrant',
    'billing.client_payment_request_sent',
    null,
    'Client payment request sent to {{clientName}}',
    $$Hi {{firstName}},

We sent a DARCi client-payment request to {{clientName}} for {{documentName}}.

Amount requested: {{amountDisplay}}

You can monitor the request from your dashboard here:
{{dashboardUrl}}

We will let you know when the payment is completed or if the request expires.

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'clientName', 'documentName', 'amountDisplay', 'dashboardUrl'),
      'optional', jsonb_build_array('dueAt'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  ),
  (
    'pro_client_payment_received_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'billing',
    'registrant',
    'billing.client_payment_received',
    null,
    '{{clientName}} completed the payment request',
    $$Hi {{firstName}},

{{clientName}} completed the DARCi payment request for {{documentName}}.

Amount received: {{amountDisplay}}

You can continue from your dashboard here:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'clientName', 'documentName', 'amountDisplay', 'dashboardUrl'),
      'optional', jsonb_build_array('paymentCompletedAt'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  ),
  (
    'pro_client_payment_request_expired_email',
    '2026.04.20.v3',
    'en-US',
    'email',
    'billing',
    'registrant',
    'billing.client_payment_request_expired',
    null,
    'Client payment request for {{clientName}} expired',
    $$Hi {{firstName}},

The DARCi client-payment request for {{clientName}} expired before payment was completed.

You can resend the request or review the latest status here:
{{dashboardUrl}}

- Your DARCi Team$$,
    'markdown',
    jsonb_build_object(
      'required', jsonb_build_array('firstName', 'clientName', 'dashboardUrl'),
      'optional', jsonb_build_array('documentName', 'amountDisplay'),
      'billing_scope', jsonb_build_array('client_pay', 'payment_request')
    ),
    true,
    'docs/notification-template-wave.md',
    jsonb_build_object('seed_source', 'phase3_wave3', 'wave', 3, 'billing_scope', jsonb_build_array('client_pay', 'payment_request')),
    now(),
    now()
  )
on conflict (template_key, template_version, locale, channel) do update
  set template_kind = excluded.template_kind,
      audience_scope = excluded.audience_scope,
      trigger_event = excluded.trigger_event,
      invite_kind = excluded.invite_kind,
      subject_template = excluded.subject_template,
      body_template = excluded.body_template,
      body_format = excluded.body_format,
      variables_schema = excluded.variables_schema,
      is_active = excluded.is_active,
      source_reference = excluded.source_reference,
      metadata = excluded.metadata,
      updated_at = now();