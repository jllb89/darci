XCODEGEN ?= xcodegen
SCHEME ?= DARCiMobile
DESTINATION ?= generic/platform=iOS Simulator
TEST_DESTINATION ?= platform=iOS Simulator,name=iPhone 17

.PHONY: bootstrap generate release-config build test open clean

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

open: generate
	open DARCiMobile.xcodeproj

clean:
	rm -rf build DerivedData DARCiMobile.xcodeproj
