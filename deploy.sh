#!/bin/sh

NAME=MacLike(Work)Spaces
UUID=MacLike(Work)Spaces@kiran86.com
OLD_UUID=MaximizeWindowIntoNewWorkspace@kyleross.com
EXTENSIONS_DIR="$HOME/.local/share/gnome-shell/extensions"

mkdir -p "$EXTENSIONS_DIR"
# Avoid running the original and renamed extensions together.
rm -rf "$EXTENSIONS_DIR/$OLD_UUID"
rm -rf "$EXTENSIONS_DIR/$UUID"
cp -r "$NAME" "$EXTENSIONS_DIR/$UUID"
