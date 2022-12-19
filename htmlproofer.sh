#!/usr/bin/env bash

bundle exec htmlproofer $1 htmlproofer --disable-external=true --allow-empty-href=true