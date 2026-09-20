"""Read-only OS resource signals for host admission; no process termination."""

from __future__ import annotations

from dataclasses import dataclass
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys

MIB = 1024**2
GIB = 1024**3


@dataclass(frozen=True)
class MemorySnapshot:
    total_bytes: int
    available_bytes: int
    pressure: str
    source: str

    @property
    def worker_limit(self) -> int:
        return 1 if self.total_bytes <= 4 * GIB or self.pressure != "normal" else 2

    @property
    def headroom(self) -> int:
        if self.pressure in {"warning", "unknown"}:
            return 1024 * MIB
        return 256 * MIB if self.total_bytes <= 4 * GIB else 512 * MIB


def command(argv: list[str]) -> str:
    result = subprocess.run(
        argv,
        capture_output=True,
        text=True,
        timeout=2,
        check=True,
        env={"PATH": os.environ.get("PATH", ""), "LC_ALL": "C", "LANG": "C"},
    )
    return result.stdout.strip()


def inspect_process(pid: int) -> str | None:
    """Return a start-bound digest; do not expose the command line or signal it."""
    if not isinstance(pid, int) or isinstance(pid, bool) or pid <= 0:
        return None
    try:
        if sys.platform.startswith("linux"):
            raw = Path(f"/proc/{pid}/stat").read_text()
            fields = raw[raw.rfind(")") + 2 :].split()
            if fields[0] == "Z":
                return None
            # PPID/PGID can change during this exact process lifetime.
            identity = f"{pid}:{fields[19]}:"
            identity += Path("/proc/sys/kernel/random/boot_id").read_text().strip()
        elif sys.platform == "darwin":
            raw = command(
                [
                    "/bin/ps",
                    "-p",
                    str(pid),
                    "-o",
                    "lstart=",
                    "-o",
                    "pgid=",
                    "-o",
                    "ppid=",
                    "-o",
                    "stat=",
                    "-o",
                    "comm=",
                ]
            )
            parts = raw.split(maxsplit=8)
            if len(parts) != 9 or parts[7].startswith("Z"):
                return None
            # Bind PID, birth time and executable, not mutable scheduling state,
            # parent or process group. ps birth time has one-second resolution;
            # the random per-lease owner token remains mandatory as well.
            identity = f"{pid}:" + " ".join(parts[:5] + parts[8:])
        elif os.name == "nt":
            identity = command(
                [
                    "powershell",
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    f"$p=Get-Process -Id {pid} -ErrorAction Stop; $p.Id; $p.StartTime.ToUniversalTime().Ticks; $p.Path",
                ]
            )
        else:
            return None
        return hashlib.sha256(identity.encode()).hexdigest()
    except (OSError, ValueError, IndexError, subprocess.SubprocessError):
        return None


def memory_snapshot() -> MemorySnapshot:
    """Use OS pressure and available/reclaimable memory, not free percent alone."""
    try:
        if sys.platform == "darwin":
            values = command(
                [
                    "/usr/sbin/sysctl",
                    "-n",
                    "hw.memsize",
                    "kern.memorystatus_vm_pressure_level",
                ]
            ).splitlines()
            total, level = int(values[0]), int(values[1])
            raw = command(["/usr/bin/vm_stat"])
            page_size = int(re.search(r"page size of (\d+) bytes", raw).group(1))
            pages = dict(re.findall(r"^([^:\n]+):\s*(\d+)\.", raw, re.MULTILINE))
            available = (
                sum(
                    int(pages.get(k, 0))
                    for k in ("Pages free", "Pages inactive", "Pages speculative")
                )
                * page_size
            )
            pressure = (
                "critical" if level >= 4 else "warning" if level >= 2 else "normal"
            )
            return MemorySnapshot(
                total, available, pressure, "darwin-vm-stat+memorystatus"
            )
        if sys.platform.startswith("linux"):
            rows = dict(
                re.findall(
                    r"^(\w+):\s*(\d+) kB",
                    Path("/proc/meminfo").read_text(),
                    re.MULTILINE,
                )
            )
            total, available = (
                int(rows["MemTotal"]) * 1024,
                int(rows["MemAvailable"]) * 1024,
            )
            pressure = "unknown"
            psi_path = Path("/proc/pressure/memory")
            if psi_path.is_file():
                raw = psi_path.read_text()
                some = float(re.search(r"some avg10=([\d.]+)", raw).group(1))
                full = float(re.search(r"full avg10=([\d.]+)", raw).group(1))
                pressure = (
                    "critical"
                    if full >= 5 or some >= 20
                    else "warning"
                    if some >= 5
                    else "normal"
                )
            return MemorySnapshot(total, available, pressure, "linux-memavailable+psi")
        if os.name == "nt":
            rows = json.loads(
                command(
                    [
                        "powershell",
                        "-NoProfile",
                        "-NonInteractive",
                        "-Command",
                        "Get-CimInstance Win32_OperatingSystem | Select-Object TotalVisibleMemorySize,FreePhysicalMemory | ConvertTo-Json -Compress",
                    ]
                )
            )
            return MemorySnapshot(
                int(rows["TotalVisibleMemorySize"]) * 1024,
                int(rows["FreePhysicalMemory"]) * 1024,
                "unknown",
                "windows-cim-pressure-unavailable",
            )
    except (
        OSError,
        ValueError,
        KeyError,
        AttributeError,
        IndexError,
        subprocess.SubprocessError,
    ):
        pass
    return MemorySnapshot(0, 0, "unknown", "telemetry-unavailable")
