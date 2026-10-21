#!/usr/bin/env python3
"""Reject unsafe or ambiguous target origins before packaging an Android test APK."""
import sys
from urllib.parse import urlsplit

def validate(value: str) -> None:
    try:
        parts = urlsplit(value)
        port = parts.port
    except ValueError as error:
        raise ValueError(f"Malformed URL: {error}") from error
    if (
        parts.scheme != "https"
        or not parts.hostname
        or parts.username is not None
        or parts.password is not None
        or parts.query
        or parts.fragment
        or port not in (None, 443)
        or any(c.isspace() or ord(c) < 32 for c in value)
    ):
        raise ValueError("Expected HTTPS host and optional path, without credentials/query/fragment/custom port")
    if parts.hostname in ("localhost", "127.0.0.1", "::1"):
        raise ValueError("The Android device cannot access a host-local preview URL")

if __name__ == "__main__":
    try:
        if len(sys.argv) != 2:
            raise ValueError("Usage: validate-android-url.py https://your-nault-host.example/")
        validate(sys.argv[1])
    except ValueError as exc:
        sys.exit(str(exc))
    print("Validated HTTPS target:", sys.argv[1])
