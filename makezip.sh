#!/bin/sh

NAME='MacLike(Work)Spaces'
OUTPUT="${NAME}.zip"
ROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"

cd "$ROOT_DIR"
rm -f "$OUTPUT"
zip -r "$OUTPUT" "$NAME"
