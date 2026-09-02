#!/bin/zsh

set -euo pipefail

SCRIPT_DIR=${0:A:h}
REPO_ROOT=${SCRIPT_DIR:h:h:h}
ENV_FILE=${1:-"$REPO_ROOT/.env.staging"}
OUTPUT_FILE="$REPO_ROOT/apps/mobile/Config/Release.local.xcconfig"

if [[ ! -f "$ENV_FILE" ]]; then
    print -u2 "Missing environment file: $ENV_FILE"
    exit 1
fi

set -a
source "$ENV_FILE"
set +a

: ${NEXT_PUBLIC_SUPABASE_URL:?NEXT_PUBLIC_SUPABASE_URL is required}
: ${NEXT_PUBLIC_SUPABASE_ANON_KEY:?NEXT_PUBLIC_SUPABASE_ANON_KEY is required}

xcconfig_url=${NEXT_PUBLIC_SUPABASE_URL//\/\//\/\$()\/}
sentry_dsn=${SENTRY_DSN:-}
xcconfig_sentry_dsn=${sentry_dsn//\/\//\/\$()\/}
sentry_environment=${SENTRY_ENVIRONMENT:-staging}
temporary_file=$(mktemp "$OUTPUT_FILE.XXXXXX")
trap 'rm -f "$temporary_file"' EXIT

{
    print '// Generated from an ignored environment file. Do not commit.'
    print "DARCI_SUPABASE_URL = $xcconfig_url"
    print "DARCI_SUPABASE_ANON_KEY = $NEXT_PUBLIC_SUPABASE_ANON_KEY"
    print "DARCI_SENTRY_DSN = $xcconfig_sentry_dsn"
    print "DARCI_SENTRY_ENVIRONMENT = $sentry_environment"
} > "$temporary_file"

mv "$temporary_file" "$OUTPUT_FILE"
trap - EXIT
print "Generated $OUTPUT_FILE"
