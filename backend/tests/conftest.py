"""Pytest configuration and environment fixtures for SafeRoute backend tests."""

import sys
from pathlib import Path

# Ensure backend root is on sys.path so 'app' is cleanly importable
backend_dir = Path(__file__).resolve().parent.parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))
