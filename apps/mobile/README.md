# DARCi Mobile

Native iOS app shell for DARCi, built with SwiftUI and generated with XcodeGen.

This project is intentionally scoped to iOS only for the first mobile milestone. The older top-level `mobile/` Flutter skeleton is left untouched.

## Project Identity

- Display name: `DARCi`
- Bundle identifier: `dev.mobile.darci`
- Minimum iOS version: `18.0`
- Project generator: `XcodeGen`

## Setup

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
