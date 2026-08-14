"""Logging setup: colour on the console, plain text in a dated file.

Every line carries the id of the request that produced it, so a user-reported error maps
straight to the exact lines that caused it.

Each run writes its own file in `backend/logs/`, named for the moment the process started —
`jobboard-2026-08-14_09-12-03.log`. That is deliberately per-run rather than per-day: when
you restart the server to reproduce something, the evidence for that attempt is in its own
file instead of interleaved with every earlier attempt. The newest `KEEP_RUNS` files are
kept and older ones are deleted on startup.

No `colorlog` dependency — the formatter below is short enough that adding one would cost
more than it saves, and ANSI is switched off automatically when stdout is not a TTY, which
is what keeps it readable in a Windows terminal that does not handle escape codes.
"""

import contextvars
import logging
import sys
from datetime import datetime
from pathlib import Path

LOG_DIR = Path(__file__).resolve().parents[2] / "logs"
KEEP_RUNS = 30

request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("request_id", default="-")

_RESET = "\033[0m"
_LEVEL_COLOR = {
    "DEBUG": "\033[2;36m",  # dim cyan
    "INFO": "\033[34m",  # blue
    "WARNING": "\033[33m",  # yellow
    "ERROR": "\033[31m",  # red
    "CRITICAL": "\033[1;97;41m",  # bold white on red
}
_DIM = "\033[2m"


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class PlainFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__(
            "%(asctime)s.%(msecs)03d | %(levelname)-8s | req=%(request_id)-8s | %(name)s | %(message)s",
            "%Y-%m-%dT%H:%M:%S",
        )


class ColorFormatter(PlainFormatter):
    def format(self, record: logging.LogRecord) -> str:
        line = super().format(record)
        colour = _LEVEL_COLOR.get(record.levelname, "")
        # Colour the level word and dim the metadata, leaving the message itself plain
        # so it stays the most readable thing on the line.
        stamp, level, req, name, message = line.split(" | ", 4)
        return f"{_DIM}{stamp}{_RESET} | {colour}{level}{_RESET} | {_DIM}{req} | {name}{_RESET} | {message}"


def _prune_old_runs() -> None:
    files = sorted(LOG_DIR.glob("jobboard-*.log"), reverse=True)
    for stale in files[KEEP_RUNS:]:
        stale.unlink(missing_ok=True)


def configure_logging(level: int = logging.INFO) -> None:
    root = logging.getLogger("jobboard")
    if root.handlers:  # configure_logging runs at import; don't stack handlers on reload
        return
    root.setLevel(level)
    root.propagate = False

    console = logging.StreamHandler(sys.stdout)
    console.setFormatter(ColorFormatter() if sys.stdout.isatty() else PlainFormatter())
    handlers: list[logging.Handler] = [console]

    # A test run is not a run worth keeping: it would otherwise drop a file per pytest
    # invocation into logs/ and push the real ones out of the retention window.
    if "pytest" not in sys.modules:
        LOG_DIR.mkdir(parents=True, exist_ok=True)
        _prune_old_runs()
        log_file = LOG_DIR / f"jobboard-{datetime.now().strftime('%Y-%m-%d_%H-%M-%S')}.log"
        # Never colour the file — escape codes make `grep` and any log viewer unusable.
        file_handler = logging.FileHandler(log_file, encoding="utf-8")
        file_handler.setFormatter(PlainFormatter())
        handlers.append(file_handler)

    for handler in handlers:
        handler.addFilter(RequestIdFilter())
        root.addHandler(handler)

    if len(handlers) > 1:
        root.info("Logging to %s", log_file)
