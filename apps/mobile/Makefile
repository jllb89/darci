XCODEGEN ?= xcodegen
SCHEME ?= DARCiMobile
DESTINATION ?= generic/platform=iOS Simulator
TEST_DESTINATION ?= platform=iOS Simulator,name=iPhone 17
ARCHIVE_PATH ?= build/DARCiMobile.xcarchive
APP_STORE_PROFILE ?= DARCi App Store com.illuminote.darci TF 2026-08-10

.PHONY: bootstrap generate release-config build test archive open clean

bootstrap:
	@command -v $(XCODEGEN) >/dev/null || { echo "XcodeGen is missing. Install it with: brew install xcodegen"; exit 1; }

generate: bootstrap
	$(XCODEGEN) generate

release-config:
	zsh ./scripts/generate-release-config.sh

build: generate
	xcodebuild -scheme $(SCHEME) -destination '$(DESTINATION)' build

test: generate
	xcodebuild -scheme $(SCHEME) -destination '$(TEST_DESTINATION)' test

archive: release-config generate
	xcodebuild -scheme $(SCHEME) -configuration Release -destination 'generic/platform=iOS' -archivePath '$(ARCHIVE_PATH)' -allowProvisioningUpdates PROVISIONING_PROFILE_SPECIFIER='$(APP_STORE_PROFILE)' archive

open: generate
	open DARCiMobile.xcodeproj

clean:
	rm -rf build DerivedData DARCiMobile.xcodeproj
