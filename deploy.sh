#!/bin/sh

NAME='MacLike(Work)Spaces'
UUID='maclike-work-spaces@kiran86.com'
OLD_UUID='MaximizeWindowIntoNewWorkspace@kyleross.com'
LEGACY_UUID='MacLikeWorkSpaces@kiran86.com'
LEGACY_OLD_UUID='MaximizeWindowLikeMac@kiran86.com'
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"

mkdir -p "$EXTENSIONS_DIR"
# Avoid running the original, renamed, and legacy variants together.
rm -rf "$EXTENSIONS_DIR/$OLD_UUID"
rm -rf "$EXTENSIONS_DIR/$LEGACY_UUID"
rm -rf "$EXTENSIONS_DIR/$LEGACY_OLD_UUID"
rm -rf "$EXTENSIONS_DIR/$UUID"
cp -r "$NAME" "$EXTENSIONS_DIR/$UUID"
