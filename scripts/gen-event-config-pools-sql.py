#!/usr/bin/env python3
"""إنشاء supabase/reset-event-seat-pools.sql من threa-panorama-pins.json"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PINS = json.loads((ROOT / "threa-panorama-pins.json").read_text(encoding="utf-8"))["seats"]
PIN_IDS = set(PINS.keys())

GUEST_ROWS = [1, 10, 11, 12]
GUEST_ROW1_MIN = 4


def policy_guest_ids():
    ids = []
    for section in ("LEFT", "RIGHT"):
        for row in GUEST_ROWS:
            count = 8 if row == 12 else 9
            for seat in range(1, count + 1):
                if row == 1 and seat < GUEST_ROW1_MIN:
                    continue
                ids.append(f"{section}-R{row:02d}-S{seat:02d}")
    for seat in range(1, 4):
        ids.append(f"BRIDGE-R12-S{seat:02d}")
    return ids


student = [
    f"LEFT-R{row:02d}-S{s:02d}"
    for row in range(2, 10)
    for s in range(1, 10)
    if f"LEFT-R{row:02d}-S{s:02d}" in PIN_IDS
]
companion = [
    f"RIGHT-R{row:02d}-S{s:02d}"
    for row in range(2, 10)
    for s in range(1, 10)
    if f"RIGHT-R{row:02d}-S{s:02d}" in PIN_IDS
]
sql = f"""-- إعادة ضبط قوائم مقاعد الخريجين والمرافقين (من المعايرة)
-- مقاعد الضيوف تُحدَّد يدوياً من المعايرة ← قوائم المقاعد ← ضيوف
-- Project: mookpmxugpgpofocuddk
-- خريج: {len(student)} مقعد · مرافق: {len(companion)}

UPDATE public.threa_event_config
SET
  student_seat_ids = '{json.dumps(student, ensure_ascii=False)}'::jsonb,
  companion_seat_ids = '{json.dumps(companion, ensure_ascii=False)}'::jsonb,
  updated_at = now()
WHERE id = 'default';
"""
(ROOT / "supabase" / "reset-event-seat-pools.sql").write_text(sql, encoding="utf-8")
print(f"student={len(student)} companion={len(companion)}")
