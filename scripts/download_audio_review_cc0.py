import html
import json
import re
import urllib.request
from pathlib import Path

SOUNDS = {
    "switch_snap": 842480,
    "mechanical_switch": 496328,
    "latch_lock": 815491,
    "ui_press": 849839,
    "ui_click": 840903,
    "card_drop": 817539,
    "card_slide": 843344,
    "dice_roll": 629982,
    "dice_throw": 707911,
    "countdown_robotic": 753649,
    "low_impact": 408141,
    "bid_confirm": 584184,
    "auction_close": 822568,
    "rebalance_clean": 108334,
    "rebalance_alt": 833629,
    "bid_menu_select": 171697,
    "bid_soft_select": 653382,
    "bid_metal_select": 829014,
    "bid_button_click": 677861,
}

OUT = Path(__file__).resolve().parents[1] / "apps/web/public/audio-review/freesound-cc0"
OUT.mkdir(parents=True, exist_ok=True)

def fetch(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as response:
        return response.read()

for name, sound_id in SOUNDS.items():
    existing = OUT / f"{name}_{sound_id}.mp3"
    if existing.exists():
        print(json.dumps({"name": name, "id": sound_id, "target": str(existing), "cached": True}))
        continue
    page_url = f"https://freesound.org/s/{sound_id}/"
    page = fetch(page_url).decode("utf-8", "ignore")
    decoded = html.unescape(page).replace("\\/", "/")
    candidates = re.findall(
        r'https?://[^"\' ]+(?:preview-hq|preview-lq)[^"\' ]+\.(?:mp3|ogg)',
        decoded,
    )
    if not candidates:
        candidates = re.findall(
            r'https?://[^"\' ]+/previews/[^"\' ]+\.(?:mp3|ogg)',
            decoded,
        )
    if not candidates:
        raise RuntimeError(f"Preview URL not found for {sound_id}")
    preview = next((u for u in candidates if "preview-hq" in u and u.endswith(".mp3")), candidates[0])
    if "https://freesound.orghttps://" in preview:
        preview = preview.replace("https://freesound.orghttps://", "https://")
    print(json.dumps({"name": name, "id": sound_id, "preview": preview}), flush=True)
    suffix = ".mp3" if preview.endswith(".mp3") else ".ogg"
    target = OUT / f"{name}_{sound_id}{suffix}"
    target.write_bytes(fetch(preview))
    print(json.dumps({"name": name, "id": sound_id, "preview": preview, "target": str(target)}))
