"""Shared settings."""

import os

# Claude model used for every call. Override with THEO_MODEL.
MODEL = os.environ.get("THEO_MODEL", "claude-sonnet-4-6")
