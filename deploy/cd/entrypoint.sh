#!/bin/sh
# The credential store is mounted read-only so the container cannot alter the
# host's copy, but git rewrites the store after a successful auth. Copy it to
# $HOME, where the `store` helper already looks.
if [ -f /run/git-credentials ] && [ -n "$HOME" ]; then
  cp /run/git-credentials "$HOME/.git-credentials"
  chmod 600 "$HOME/.git-credentials"
fi
exec "$@"
