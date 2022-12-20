#!/usr/bin/env bash

ARGS=($2)

htmlproofer $1 "${ARGS[@]}" 2>raw-errors.txt > /dev/null
CODE=$?

if [ "$CODE" -eq "0" ]; then
  exit 0
fi

# Strip the parts of html-proofer output we don't care about
head -n -2 raw-errors.txt | tail +2 > errors.txt

while read LINE; do
  if [[ "$LINE" =~ ^\*[[:space:]]At[[:space:]]([^:]*) ]]; then
    PAGE="${BASH_REMATCH[1]}"
  elif [[ ! "$LINE" =~ ^$ ]]; then
    echo "::error title=${LINE//,}::in ${PAGE//,}"
  fi
done < errors.txt

exit 1