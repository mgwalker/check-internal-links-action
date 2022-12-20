#!/usr/bin/env bash

ARGS=($2)

htmlproofer $1 "${ARGS[@]}" 2>raw-errors.txt > /dev/null
CODE=$?

if [ "$CODE" -eq "0" ]; then
  exit 0
fi

# html-proofer output begins with a type-of-test header and ends with
head -n -2 raw-errors.txt > errors.txt

while read LINE; do
  if [[ "$LINE" =~ ^\*[[:space:]]At[[:space:]]([^:]*) ]]; then
    # This line indicates a file with an error in it, so save off the page name
    PAGE="${BASH_REMATCH[1]}"
  elif [[ "$LINE" =~ ^For[[:space:]]the ]]; then
    # This line indicates the start of a new type-of-test. We don't care.
    :
  elif [[ ! "$LINE" =~ ^$ ]]; then
    # This line is not empty, so it must be error text. Now we can output it!
    echo "::error title=${LINE//,}::in ${PAGE//,}"
  fi
done < errors.txt

exit 1