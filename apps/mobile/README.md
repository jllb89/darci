# DARCi Mobile

Native iOS app shell for DARCi, built with SwiftUI and generated with XcodeGen.

This project is intentionally scoped to iOS only for the first mobile milestone. The older top-level `mobile/` Flutter skeleton is left untouched.

## Project Identity

- Display name: `DARCi`
- Bundle identifier: `com.illuminote.darci`
- Minimum iOS version: `18.0`
- Project generator: `XcodeGen`

## Production candidate (separate from staging)

The existing `DARCiMobile` scheme still archives staging with `Release`.
Use **`DARCiMobile-Production` / `Production`** for the real production project.
They share an App Store bundle ID, so installing one replaces the other on a phone;
the production Keychain session/installation namespace is separate. Switching to
production requires a fresh login and never imports beta records.

```sh
cd /Users/jorge/Desktop/darci/apps/mobile
zsh scripts/generate-release-config.sh --environment production
make generate
open -a Xcode DARCiMobile.xcodeproj
```

Select `DARCiMobile-Production`, a generic physical iPhone destination, then
Product → Archive. Or use `make production-archive`. Never run the staging
`make archive` command for a production release. The generator parses (does not
execute) `.env.production`, copies only allowlisted public values, and writes the
ignored `Config/Production.local.xcconfig`. It rejects a staging Supabase project
or privileged key. Production telemetry remains disabled as requested.

After archiving, verify the actual artifact, not merely source settings:

```sh
node scripts/verify-production-archive.mjs build/DARCiMobile-Production.xcarchive
```

The checker validates API/web/Supabase/APNs, signing/profile expiry, environment-
specific associated domains, privacy manifest and matching executable/dSYM UUIDs.
It does not upload to TestFlight, send messages or activate purchases. Check the
build number against App Store Connect before distribution; the tracked next
candidate is build 21. See the Phase 4 execution record for the tested artifact.

## Development setup

Install XcodeGen once:

```sh
brew install xcodegen
```

Generate the Xcode project:

```sh
make generate
```

Open the app in Xcode:

```sh
make open
```

Build from the command line:

```sh
make build
```

Run tests from the command line:

```sh
make test
```

If your local simulator has a different device name, override the destination:

```sh
make test TEST_DESTINATION='platform=iOS Simulator,name=iPhone 16'
```

## Structure

- `project.yml` describes the Xcode project.
- `DARCiMobile/` contains the SwiftUI app target.
- `DARCiMobile/Resources/` contains app assets, registered fonts, and future resource routes.
- `DARCiMobileTests/` contains unit tests.
- `DARCiMobileUITests/` contains UI launch tests.

The generated `DARCiMobile.xcodeproj` is ignored by git. Keep project changes in `project.yml` so the Xcode project remains reproducible.

## Initial Product Sections

- Onboarding
- Sign in / up
- Home
- Documents
- Document Generator
- Requests
- In-person Meeting
- Notary Profile

The first tab shell exposes Home, Documents, Generate, Requests, and Notary. Onboarding and authentication sit before the signed-in shell; in-person meeting is modeled as a workflow section reached from requests/home instead of a sixth tab.

The launch surface currently renders the Figma splash screen as a native SwiftUI view. It uses the system status bar instead of the exported static status-bar layer, and keeps the splash copy in `OnboardingScreenContent` so the remaining onboarding screens can follow the same pattern.
