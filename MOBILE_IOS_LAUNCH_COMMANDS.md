# DARCi Native iOS Launch Commands

Native iOS app: `apps/mobile`  
Scheme: `DARCiMobile`  
Bundle id: `com.illuminote.darci`
Simulator: `vet` (`D344C088-92BE-4393-B3A5-3E786FD17498`)

## Launch On vet

This is the exact command used to build, install, and launch the app on `vet` with real staging auth:

```sh
cd /Users/jorge/Desktop/darci/apps/mobile && set -o pipefail && set -a && source ../../.env.staging && set +a && rm -rf .DerivedData && xcodegen generate && xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath .DerivedData DARCI_API_BASE_URL=https://api.staging.darciregistry.dev DARCI_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" DARCI_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" build && (xcrun simctl boot vet >/dev/null 2>&1 || true) && open -a Simulator && xcrun simctl install vet "$PWD/.DerivedData/Build/Products/Debug-iphonesimulator/DARCiMobile.app" && xcrun simctl terminate vet com.illuminote.darci >/dev/null 2>&1 || true && xcrun simctl launch vet com.illuminote.darci
```

For a backend running locally on port `4000`, use the localhost build instead:
w
```sh
cd /Users/jorge/Desktop/darci/apps/mobile && set -o pipefail && rm -rf .DerivedData && xcodegen generate && xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath .DerivedData build && (xcrun simctl boot vet >/dev/null 2>&1 || true) && open -a Simulator && xcrun simctl install vet "$PWD/.DerivedData/Build/Products/Debug-iphonesimulator/DARCiMobile.app" && xcrun simctl terminate vet com.illuminote.darci >/dev/null 2>&1 || true && xcrun simctl launch vet com.illuminote.darci
```

Same thing, easier to read:

```sh
cd /Users/jorge/Desktop/darci/apps/mobile
set -e
set -o pipefail
set -a
source ../../.env.staging
set +a
rm -rf .DerivedData
xcodegen generate
xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath .DerivedData DARCI_API_BASE_URL=https://api.staging.darciregistry.dev DARCI_SUPABASE_URL="$NEXT_PUBLIC_SUPABASE_URL" DARCI_SUPABASE_ANON_KEY="$NEXT_PUBLIC_SUPABASE_ANON_KEY" build
xcrun simctl boot vet >/dev/null 2>&1 || true
open -a Simulator
xcrun simctl install vet "$PWD/.DerivedData/Build/Products/Debug-iphonesimulator/DARCiMobile.app"
xcrun simctl terminate vet com.illuminote.darci >/dev/null 2>&1 || true
xcrun simctl launch vet com.illuminote.darci
```

Local-backend version:

```sh
cd /Users/jorge/Desktop/darci/apps/mobile
set -e
set -o pipefail
rm -rf .DerivedData
xcodegen generate
xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' -derivedDataPath .DerivedData build
xcrun simctl boot vet >/dev/null 2>&1 || true
open -a Simulator
xcrun simctl install vet "$PWD/.DerivedData/Build/Products/Debug-iphonesimulator/DARCiMobile.app"
xcrun simctl terminate vet com.illuminote.darci >/dev/null 2>&1 || true
xcrun simctl launch vet com.illuminote.darci
```

## Relaunch Only

Use this when the app is already installed and you just want to restart it:

```sh
xcrun simctl boot vet >/dev/null 2>&1 || true
open -a Simulator
xcrun simctl terminate vet com.illuminote.darci >/dev/null 2>&1 || true
xcrun simctl launch vet com.illuminote.darci
```

## Run Tests

```sh
cd /Users/jorge/Desktop/darci/apps/mobile
xcodegen generate
xcodebuild -quiet -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' test
```

## Push Supabase Migrations To Staging

Use this after adding a new file under `supabase/migrations/` and before staging validation needs the schema or seed data.

```sh
cd /Users/jorge/Desktop/darci
set -e
set -o pipefail
set -a
source .env.staging
set +a

supabase migration list --db-url "$DATABASE_URL" | tail -40
supabase db push --db-url "$DATABASE_URL" --dry-run
supabase db push --db-url "$DATABASE_URL" --yes
supabase migration list --db-url "$DATABASE_URL" | tail -40
```

For one-off verification after a push-template migration:

```sh
cd /Users/jorge/Desktop/darci/backend
DOTENV_CONFIG_PATH=../.env.staging node -r dotenv/config - <<'NODE'
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
	auth: { persistSession: false },
});

(async () => {
	const { data, error } = await supabase
		.from('notification_templates')
		.select('template_key, channel, subject_template, is_active')
		.eq('channel', 'push')
		.order('template_key', { ascending: true });

	if (error) throw error;
	console.log(JSON.stringify({ count: data.length, rows: data }, null, 2));
})().catch((error) => {
	console.error(error.message || error);
	process.exit(1);
});
NODE
```

If the simulator gets stuck during tests:

```sh
xcrun simctl terminate vet com.illuminote.darci >/dev/null 2>&1 || true
xcrun simctl terminate vet com.illuminote.darci.uitests.xctrunner >/dev/null 2>&1 || true
```

## Open In Xcode

```sh
cd /Users/jorge/Desktop/darci/apps/mobile
make open
```

## Useful Checks

List available simulators:

```sh
xcrun simctl list devices available
```

Show valid Xcode destinations:

```sh
cd /Users/jorge/Desktop/darci/apps/mobile
xcodegen generate
xcodebuild -scheme DARCiMobile -showdestinations
```

Stream app logs:

```sh
xcrun simctl spawn vet log stream --predicate 'process == "DARCiMobile"' --style compact
```

Stream staging API logs:

```sh
LOG_GROUP=$(aws ecs describe-task-definition --region us-east-1 --task-definition "$(aws ecs describe-services --region us-east-1 --cluster darci-staging --services darci-staging-api --query 'services[0].taskDefinition' --output text)" --query 'taskDefinition.containerDefinitions[0].logConfiguration.options.awslogs-group' --output text)
aws logs tail "$LOG_GROUP" --region us-east-1 --since 15m --follow --format short
```

Draft-save mobile logs use the `document-intake` category and include document id, step, revision, autosave flag, and the API error/status when available.

## Destination Syntax

This is valid:

```sh
xcodebuild -scheme DARCiMobile -destination 'platform=iOS Simulator,name=vet' build
```

This is invalid:

```sh
xcodebuild -scheme DARCiMobile -destination 'vet' build
```

`xcodebuild -destination` needs `key=value` pairs. `simctl` accepts `vet`; `xcodebuild` needs `platform=iOS Simulator,name=vet`.
