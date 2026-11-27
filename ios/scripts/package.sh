#!/bin/sh
# Run on a Mac from any directory; Xcode supplies the device SDK.
set -eu
base=$(CDPATH= cd -- "$(dirname "$0")/../.." && pwd)
build=$(mktemp -d)
trap 'rm -rf "$build"' EXIT
app="$build/Payload/WorldCup2027.app"
mkdir -p "$app" "$base/output"
xcrun --sdk iphoneos clang -Os -fobjc-arc -miphoneos-version-min=16.0 -arch arm64 -framework Foundation -framework UIKit -framework QuartzCore -framework GameController -framework WebKit -Wl,-no_adhoc_codesign "$base/ios/WorldCup.m" -o "$app/WorldCup2027"
cp "$base/ios/Info.plist" "$app/"
cp "$base/ios/Assets/"*.png "$app/"
cp -R "$base/game" "$app/www"
(cd "$build" && zip -q -r "$base/output/World Cup 2027-unsigned.ipa" Payload)
