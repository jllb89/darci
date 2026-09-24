#!/bin/sh
set -eu
case "${CONFIGURATION:-}" in
  Production)
    test "${DARCI_ENVIRONMENT:-}" = production
    test "${DARCI_API_BASE_URL:-}" = https://api.illuminotary.com
    test "${DARCI_WEB_BASE_URL:-}" = https://app.illuminotary.com
    test "${DARCI_SUPABASE_URL:-}" = https://jdrgluisxhgegdsesman.supabase.co
    test "${DARCI_ASSOCIATED_DOMAIN:-}" = app.illuminotary.com
    test "${APS_ENVIRONMENT:-}" = production
    test -z "${DARCI_SENTRY_DSN:-}"
    test -n "${DARCI_SUPABASE_ANON_KEY:-}"
    ;;
esac
