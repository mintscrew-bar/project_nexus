"""꾸미기 상품 그림 만들기 — 아바타 장식(투명 고리 그림)·카드 배경을 ComfyUI 로 뽑는다.

코드로 그린 장식(벡터·픽셀)은 수묵화 같은 붓맛을 못 낸다(2026-11-19 흑룡 두 번 실패).
그래서 그림 모델(Animagine XL 4.0)로 뽑고, 사이트 규격에 맞게 다듬는다.

Windows ComfyUI 파이썬으로 실행한다(PIL 이 있고 ComfyUI 에 localhost 로 붙는다):

  set COMFY_HOST=http://127.0.0.1:8188
  python.exe cosmetic_art.py avatar <출력폴더> --theme ink_dragon --count 4
  python.exe cosmetic_art.py card   <출력폴더> --theme ink_dragon --count 4

아바타 장식(avatar)
  1) 고리 모양 밑그림(1024²: 흰 바탕에 거친 먹 고리)을 깔고 그림→그림(denoise 0.82)으로 뽑는다.
     밑그림이 구도를 잡아 용이 원을 따라 감고 가운데가 빈다.
  2) BiRefNet 으로 배경을 지워 투명하게 만든다.
  3) 가운데 아바타 자리(지름의 50%)를 둥글게 뚫고 384×384 로 줄인다 — 규격 가이드와 같다
     (가운데 192 원 = 아바타, 둘레 96 여백 = 장식).
  → <출력폴더>/<테마>_avatar_<n>.png  (+ _raw.png 원본)

카드 배경(card)
  로비 카드(최대 220×210)의 뒤 그림. 1024×960 으로 뽑아 880×840(2배)으로 맞춘다.
  위쪽 가운데는 원형 사진이 덮으므로 그림의 볼거리는 둘레·아래쪽에 오게 프롬프트를 쓴다.
  → <출력폴더>/<테마>_card_<n>.png
"""
import argparse
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from PIL import Image, ImageDraw, ImageFilter  # noqa: E402

import comfy_api as api  # noqa: E402

CKPT = "animagine-xl-4.0-opt.safetensors"
QUALITY = "masterpiece, high score, great score, absurdres"
NEG = (
    "lowres, bad anatomy, bad hands, text, signature, watermark, username, logo, "
    "jpeg artifacts, blurry, worst quality, low quality, cropped, multiple views, frame, border"
)

THEMES = {
    "ink_dragon": {
        "avatar": (
            f"{QUALITY}, ink wash painting, sumi-e, traditional media, monochrome, greyscale, "
            "spot color, red eyes, eastern dragon, black dragon, long body coiling in a circle, "
            "ring composition, circular, empty center, white background, simple background, "
            "flowing brush strokes, ink splatter, whiskers, horns, claws, scales, no humans"
        ),
        "card": (
            f"{QUALITY}, ink wash painting, sumi-e, traditional media, monochrome, spot color, "
            "eastern dragon, black dragon flying through clouds, red sun, rice paper texture, "
            "mist, mountains, vertical composition, dragon body around the edges, "
            "empty space in upper center, no humans"
        ),
    },
}


def guide_ring(path, size=1024, seed=0, r0=0.29, r1=0.43, w0=0.02, w1=0.06, n=260):
    """흰 바탕에 거친 먹 고리 — 그림→그림의 구도 잡기용.
    r0~r1: 고리 띠 반지름(지름 대비), w0~w1: 붓자국 크기 — 가늘게 하려면 띠·붓자국을 줄인다."""
    rnd = random.Random(seed)
    im = Image.new("RGB", (size, size), (245, 242, 234))
    d = ImageDraw.Draw(im)
    c = size / 2
    # 고리 띠(아바타 지름 50% 바깥, 반지름 0.27~0.44)를 붓질 여러 번으로
    for _ in range(n):
        a = rnd.uniform(0, math.tau)
        r = rnd.uniform(r0, r1) * size
        w = rnd.uniform(w0, w1) * size
        x, y = c + math.cos(a) * r, c + math.sin(a) * r
        g = rnd.randint(15, 70)
        d.ellipse((x - w, y - w * 0.6, x + w, y + w * 0.6), fill=(g, g, g))
    im = im.filter(ImageFilter.GaussianBlur(6))
    im.save(path)
    return path


def img2img(prompt, image_name, seed, denoise, prefix):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "5": {"class_type": "VAEEncode", "inputs": {"pixels": ["4", 0], "vae": ["1", 2]}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
                "latent_image": ["5", 0], "seed": seed, "steps": 28, "cfg": 6.0,
                "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": denoise,
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "8": {"class_type": "LoadBackgroundRemovalModel", "inputs": {"bg_removal_name": "birefnet.safetensors"}},
        "9": {"class_type": "RemoveBackground", "inputs": {"bg_removal_model": ["8", 0], "image": ["7", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": prefix}},
        "11": {"class_type": "MaskToImage", "inputs": {"mask": ["9", 0]}},
        "12": {"class_type": "SaveImage", "inputs": {"images": ["11", 0], "filename_prefix": prefix + "_mask"}},
    }


def inpaint(prompt, image_name, mask_name, seed, denoise, prefix):
    """가린 곳(마스크 흰 부분)만 다시 그린다 — 바깥은 원본 그대로 덮어 둔다"""
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG + ", open mouth, teeth, fangs, roaring", "clip": ["1", 1]}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "13": {"class_type": "LoadImageMask", "inputs": {"image": mask_name, "channel": "red"}},
        "5": {"class_type": "VAEEncode", "inputs": {"pixels": ["4", 0], "vae": ["1", 2]}},
        "14": {"class_type": "SetLatentNoiseMask", "inputs": {"samples": ["5", 0], "mask": ["13", 0]}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
                "latent_image": ["14", 0], "seed": seed, "steps": 30, "cfg": 6.5,
                "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": denoise,
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "15": {
            "class_type": "ImageCompositeMasked",
            "inputs": {"destination": ["4", 0], "source": ["7", 0], "x": 0, "y": 0, "resize_source": False, "mask": ["13", 0]},
        },
        "10": {"class_type": "SaveImage", "inputs": {"images": ["15", 0], "filename_prefix": prefix}},
    }


def ellipse_mask(path, size, cx, cy, rx, ry, feather=18):
    """흰 타원(다시 그릴 곳) — 가장자리를 부드럽게 해 이음매가 안 보이게"""
    m = Image.new("RGB", size, (0, 0, 0))
    ImageDraw.Draw(m).ellipse((cx - rx, cy - ry, cx + rx, cy + ry), fill=(255, 255, 255))
    m.filter(ImageFilter.GaussianBlur(feather)).save(path)
    return path


HEAD_PROMPTS = {
    "ink_dragon": (
        f"{QUALITY}, ink wash painting, sumi-e, traditional media, monochrome, spot color, red eyes, "
        "eastern dragon head in profile, closed mouth, sleek sharp narrow head, slim pointed snout, "
        "elegant, horns swept back, long whiskers flowing, fierce calm eye, brush strokes, white background"
    ),
}


def txt2img(prompt, seed, w, h, prefix):
    return {
        "1": {"class_type": "CheckpointLoaderSimple", "inputs": {"ckpt_name": CKPT}},
        "2": {"class_type": "CLIPTextEncode", "inputs": {"text": prompt, "clip": ["1", 1]}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"text": NEG, "clip": ["1", 1]}},
        "5": {"class_type": "EmptyLatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "6": {
            "class_type": "KSampler",
            "inputs": {
                "model": ["1", 0], "positive": ["2", 0], "negative": ["3", 0],
                "latent_image": ["5", 0], "seed": seed, "steps": 28, "cfg": 6.0,
                "sampler_name": "euler_ancestral", "scheduler": "normal", "denoise": 1.0,
            },
        },
        "7": {"class_type": "VAEDecode", "inputs": {"samples": ["6", 0], "vae": ["1", 2]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["7", 0], "filename_prefix": prefix}},
    }


def ink_alpha(im, paper=248):
    """먹 그림의 흰 종이를 투명하게 — 「색을 알파로」 방식.

    배경 제거 모델(BiRefNet)은 고리 안쪽 흰 종이까지 그림으로 봐서 남겼다. 수묵화는
    종이가 희고 먹·주묵만 칠해져 있으니, 가장 어두운 채널로 불투명도를 정하고 색은 흰
    바탕을 걷어낸 값으로 되돌린다. 튄 먹물·붉은 점도 그대로 살고 종이만 빠진다.
    """
    import numpy as np

    a = np.asarray(im.convert("RGB")).astype(np.float32)
    lo = a.min(axis=2)
    alpha = np.clip((paper - lo) / paper, 0, 1)
    # 흰 바탕 위 색 = 원래색·α + 흰색·(1-α) → 원래색 = (관측 - 255(1-α)) / α
    with np.errstate(divide="ignore", invalid="ignore"):
        col = (a - 255 * (1 - alpha[..., None])) / np.maximum(alpha[..., None], 1e-3)
    col = np.clip(col, 0, 255)
    out = np.dstack([col, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA")


def finish_disc(raw_path, out_path, out_size=384, hole=0.5, outer=0.96):
    """종이째 둥근 원판으로 오린다 — 바깥 원(지름 outer) 안쪽만 남기고 가운데 아바타 자리를 뚫는다.

    먹 그림은 어두운 사이트 바탕에서 종이를 지우면 먹이 묻혀 안 보인다(2026-11-19 실측).
    그래서 한지 원판을 그대로 남겨 먹이 밝은 종이 위에서 읽히게 한다. 가장자리는 부드럽게.
    """
    im = Image.open(raw_path).convert("RGB")
    size = im.size[0]
    c = size / 2
    m = Image.new("L", im.size, 0)
    d = ImageDraw.Draw(m)
    ro = size * outer / 2
    d.ellipse((c - ro, c - ro, c + ro, c + ro), fill=255)
    rh = size * hole / 2
    d.ellipse((c - rh, c - rh, c + rh, c + rh), fill=0)
    m = m.filter(ImageFilter.GaussianBlur(size * 0.012))
    # 안쪽 구멍 가장자리는 또렷하게(아바타 테두리에 붙는다) — 바깥만 번진 채로 둔다
    sharp = Image.new("L", im.size, 255)
    ImageDraw.Draw(sharp).ellipse((c - rh, c - rh, c + rh, c + rh), fill=0)
    m = Image.composite(m, Image.new("L", im.size, 0), sharp)
    im.putalpha(m)
    im.resize((out_size, out_size), Image.LANCZOS).save(out_path)


def finish_spin(raw_path, out_path, out_size=384, hole=0.5, outer=0.92, invert=False):
    """종이 없이 먹만 남겨(ink_alpha) 고리 띠만 오린다 — 돌려도 되는 장식.

    - 고리 바깥(붓글씨·낙관이 있는 모서리)은 잘라 돌릴 때 글씨가 같이 돌지 않게 한다.
    - invert: 먹을 밝은 미색으로 바꾼다(붉은색은 그대로) — 어두운 사이트 바탕에서 읽히게.
    """
    import numpy as np

    rgba = ink_alpha(Image.open(raw_path))
    a = np.asarray(rgba).astype(np.float32)
    if invert:
        rgb = a[..., :3]
        # 채도 낮은(먹) 부분만 밝게 뒤집는다 — 붉은 주묵은 그대로 둔다
        sat = rgb.max(axis=2) - rgb.min(axis=2)
        ink = np.clip(1 - sat / 80, 0, 1)[..., None]
        light = 255 - rgb * 0.55
        tone = np.array([236, 230, 214], np.float32) / 255
        rgb[:] = rgb * (1 - ink) + light * tone * ink
    size = rgba.size[0]
    c = size / 2
    m = Image.new("L", rgba.size, 0)
    d = ImageDraw.Draw(m)
    ro, rh = size * outer / 2, size * hole / 2
    d.ellipse((c - ro, c - ro, c + ro, c + ro), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(size * 0.01))
    ImageDraw.Draw(m).ellipse((c - rh, c - rh, c + rh, c + rh), fill=0)
    a[..., 3] *= np.asarray(m, np.float32) / 255
    out = Image.fromarray(a.clip(0, 255).astype(np.uint8), "RGBA")
    out.resize((out_size, out_size), Image.LANCZOS).save(out_path)


def finish_avatar(raw_path, mask_path, out_path, out_size=384, hole=0.5):
    """종이를 투명하게 하고(ink_alpha), 가운데 아바타 자리를 뚫어 out_size 로 줄인다.
    mask_path(BiRefNet)는 먹 그림이 아닌 테마용으로 남겨 둔다."""
    im = Image.open(raw_path).convert("RGB")
    size = im.size[0]
    # 가운데 원(아바타 자리) 뚫기 — 가장자리는 살짝 부드럽게
    hole_mask = Image.new("L", im.size, 255)
    r = size * hole / 2
    c = size / 2
    ImageDraw.Draw(hole_mask).ellipse((c - r, c - r, c + r, c + r), fill=0)
    hole_mask = hole_mask.filter(ImageFilter.GaussianBlur(2))
    rgba = ink_alpha(im)
    alpha = Image.composite(rgba.getchannel("A"), Image.new("L", im.size, 0), hole_mask)
    rgba.putalpha(alpha)
    rgba.resize((out_size, out_size), Image.LANCZOS).save(out_path)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("kind", choices=["avatar", "card", "head"])
    ap.add_argument("--src", help="head: 머리를 고칠 원본(_raw.png)")
    ap.add_argument("--ellipse", type=int, nargs=4, metavar=("CX", "CY", "RX", "RY"), help="head: 다시 그릴 타원")
    ap.add_argument("out_dir")
    ap.add_argument("--theme", default="ink_dragon", choices=list(THEMES))
    ap.add_argument("--count", type=int, default=4)
    ap.add_argument("--seed", type=int, default=1000)
    ap.add_argument("--denoise", type=float, default=0.82)
    ap.add_argument("--thin", action="store_true", help="가는 고리 밑그림 + 가는 몸 프롬프트")
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)

    if a.kind == "head":
        # 머리만 다시 그린다(입 닫고 날렵하게 — 2026-11-19 운영자). 나머지는 원본 그대로
        src = Image.open(a.src)
        base = os.path.splitext(os.path.basename(a.src))[0].replace("_raw", "")
        mask = ellipse_mask(os.path.join(a.out_dir, f"{base}_headmask.png"), src.size, *a.ellipse)
        img_name, mask_name = api.upload(a.src), api.upload(mask)
        for i in range(a.count):
            seed = a.seed + i
            print(f"[{i + 1}/{a.count}] seed {seed}", flush=True)
            outs, t = api.run(
                inpaint(HEAD_PROMPTS[a.theme], img_name, mask_name, seed, a.denoise, f"nexus_head_{base}_{seed}"),
                progress=False,
            )
            raw = os.path.join(a.out_dir, f"{base}_head{seed}_raw.png")
            api.fetch(outs["10"]["images"][0], raw)
            finish_spin(raw, os.path.join(a.out_dir, f"{base}_head{seed}.png"), outer=0.82)
            print(f"  {t:.0f}초", flush=True)
        return

    prompt = THEMES[a.theme][a.kind]

    if a.kind == "avatar":
        if a.thin:
            # 고리가 너무 굵었다(2026-11-19 운영자) — 띠를 좁히고 붓자국을 줄인다
            guide = guide_ring(os.path.join(a.out_dir, "guide_ring_thin.png"), r0=0.31, r1=0.37, w0=0.012, w1=0.028, n=420)
            prompt = prompt.replace("long body coiling", "slender serpentine body, thin long body coiling")
        else:
            guide = guide_ring(os.path.join(a.out_dir, "guide_ring.png"))
        name = api.upload(guide)
    for i in range(a.count):
        seed = a.seed + i
        prefix = f"nexus_{a.theme}_{a.kind}{'_thin' if a.thin else ''}_{seed}"
        print(f"[{i + 1}/{a.count}] seed {seed}", flush=True)
        if a.kind == "avatar":
            outs, t = api.run(img2img(prompt, name, seed, a.denoise, prefix), progress=False)
            tag = "avatar_thin" if a.thin else "avatar"
            raw = os.path.join(a.out_dir, f"{a.theme}_{tag}_{seed}_raw.png")
            mask = os.path.join(a.out_dir, f"{a.theme}_{tag}_{seed}_mask.png")
            api.fetch(outs["10"]["images"][0], raw)
            api.fetch(outs["12"]["images"][0], mask)
            finish_spin(raw, os.path.join(a.out_dir, f"{a.theme}_{tag}_{seed}.png"))
        else:
            outs, t = api.run(txt2img(prompt, seed, 1024, 960, prefix), progress=False)
            raw = os.path.join(a.out_dir, f"{a.theme}_card_{seed}_raw.png")
            api.fetch(outs["10"]["images"][0], raw)
            Image.open(raw).convert("RGB").resize((880, 840), Image.LANCZOS).save(
                os.path.join(a.out_dir, f"{a.theme}_card_{seed}.png")
            )
        print(f"  {t:.0f}초", flush=True)


if __name__ == "__main__":
    main()
