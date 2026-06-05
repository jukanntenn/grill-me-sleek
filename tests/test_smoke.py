"""Smoke tests — verify the project skeleton is importable and intact."""


def test_server_importable() -> None:
    """server.py can be imported without errors."""
    import server  # noqa: F401, PLC0415
