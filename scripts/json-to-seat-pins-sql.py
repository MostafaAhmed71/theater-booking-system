#!/usr/bin/env python3
"""تحويل threa-panorama-pins.json إلى supabase/import-seat-pins.sql"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "threa-panorama-pins.json"
OUT = ROOT / "supabase" / "import-seat-pins.sql"


def esc(s: str) -> str:
    return str(s).replace("'", "''")


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))
    seats = data.get("seats") or {}
    lines = []
    for seat_id, pin in sorted(seats.items()):
        pan_u = float(pin["panU"])
        pan_v = float(pin["panV"])
        saved_at = esc(pin.get("savedAt") or "")
        note = esc(pin.get("note") or "")
        lines.append(
            f"  ('{esc(seat_id)}', {pan_u}, {pan_v}, '{saved_at}', '{note}')"
        )

    sql = (
        "-- استيراد معايرة البانوراما من threa-panorama-pins.json\n"
        "-- Project: mookpmxugpgpofocuddk\n"
        f"-- عدد المقاعد: {len(lines)}\n\n"
        "INSERT INTO public.threa_seat_pins (seat_id, pan_u, pan_v, saved_at, note)\n"
        "VALUES\n"
        + ",\n".join(lines)
        + "\nON CONFLICT (seat_id) DO UPDATE SET\n"
        "  pan_u = EXCLUDED.pan_u,\n"
        "  pan_v = EXCLUDED.pan_v,\n"
        "  saved_at = EXCLUDED.saved_at,\n"
        "  note = EXCLUDED.note;\n"
    )
    OUT.write_text(sql, encoding="utf-8")
    print(f"Wrote {len(lines)} pins -> {OUT}")


if __name__ == "__main__":
    main()
