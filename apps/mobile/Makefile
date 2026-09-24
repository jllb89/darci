XCODEGEN ?= xcodegen
SCHEME ?= DARCiMobile
DESTINATION ?= generic/platform=iOS Simulator
TEST_DESTINATION ?= platform=iOS Simulator,name=iPhone 17
PACKAGE_LOCK ?= Package.resolved
GENERATED_PACKAGE_LOCK ?= DARCiMobile.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved
ARCHIVE_PATH ?= build/DARCiMobile.xcarchive
APP_STORE_PROFILE ?= DARCi App Store com.illuminote.darci TF 2026-08-10

.PHONY: bootstrap generate release-config production-config build test archive production-archive open clean

bootstrap:
	@command -v $(XCODEGEN) >/dev/null || { echo "XcodeGen is missing. Install it with: brew install xcodegen"; exit 1; }

generate: bootstrap
	$(XCODEGEN) generate
	@mkdir -p $(dir $(GENERATED_PACKAGE_LOCK))
	@cp $(PACKAGE_LOCK) $(GENERATED_PACKAGE_LOCK)

release-config:
	zsh ./scripts/generate-release-config.sh

production-config:
	zsh ./scripts/generate-release-config.sh --environment production

production-archive: production-config generate
	xcodebuild -scheme DARCiMobile-Production -configuration Production -destination 'generic/platform=iOS' -archivePath 'build/DARCiMobile-Production.xcarchive' PROVISIONING_PROFILE_SPECIFIER='$(APP_STORE_PROFILE)' archive

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
