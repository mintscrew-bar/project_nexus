"""먹 그림 영상(종이 위) → 투명 배경 반복 영상(아바타 장식용).

LTX 로 뽑은 '갈기·먹이 흩날리는' 영상을 사이트 아바타 장식으로 쓴다.
  1) 프레임마다 종이를 걷는다 — cosmetic_art.ink_alpha(가장 어두운 채널로 불투명도, 흰 바탕 걷기)
  2) 고리 띠만 남긴다 — 바깥(붓글씨·낙관)·가운데(아바타 자리, 지름 50%)를 잘라 낸다
  3) 끝 N 프레임을 처음과 겹쳐 이어 붙여 반복이 튀지 않게 한다(--blend)
  4) VP9 + 알파(yuva420p) webm 과 첫 장면 png(포스터)로 저장한다
회전은 사이트에서 CSS 로 돌린다(로컬 LTX 는 고리를 돌리지 못했다, 2026-11-19).

Windows ComfyUI 파이썬으로 실행(PyAV·PIL·numpy):
  python.exe avatar_video.py <입력.webm> <출력폴더> --name ink_dragon --size 384 --blend 12
"""
import argparse
import os
import sys

import av
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from cosmetic_art import ink_alpha  # noqa: E402


def ring_mask(size, hole=0.5, outer=0.92):
    """고리 띠만 남기는 마스크(0~1) — 바깥은 부드럽게, 안쪽 구멍은 또렷하게"""
    c = size / 2
    m = Image.new("L", (size, size), 0)
    d = ImageDraw.Draw(m)
    ro, rh = size * outer / 2, size * hole / 2
    d.ellipse((c - ro, c - ro, c + ro, c + ro), fill=255)
    m = m.filter(ImageFilter.GaussianBlur(size * 0.01))
    ImageDraw.Draw(m).ellipse((c - rh, c - rh, c + rh, c + rh), fill=0)
    return np.asarray(m, np.float32) / 255


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out_dir")
    ap.add_argument("--name", default="ink_dragon")
    ap.add_argument("--size", type=int, default=384)
    ap.add_argument("--blend", type=int, default=12, help="끝을 처음과 겹치는 프레임 수")
    ap.add_argument("--skip", type=int, default=0, help="앞에서 버릴 프레임 수")
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--hole", type=float, default=0.5, help="가운데 뚫을 지름 비율(아바타 자리)")
    ap.add_argument("--outer", type=float, default=0.92, help="남길 바깥 지름 비율")
    ap.add_argument("--poster-webp", action="store_true", help="포스터를 투명 webp 로도 저장")
    a = ap.parse_args()
    os.makedirs(a.out_dir, exist_ok=True)

    src = av.open(a.src)
    frames = [f.to_image().convert("RGB") for f in src.decode(video=0)][a.skip:]
    mask = ring_mask(a.size, a.hole, a.outer)
    rgba = []
    for im in frames:
        im = im.resize((a.size, a.size), Image.LANCZOS)
        arr = np.asarray(ink_alpha(im)).astype(np.float32)
        arr[..., 3] *= mask
        rgba.append(arr)

    # 반복 이음: 끝 blend 장을 처음 blend 장과 섞고, 처음 blend 장은 버린다
    n = len(rgba)
    b = min(a.blend, n // 3)
    if b > 0:
        out = []
        for i in range(b, n - b):
            out.append(rgba[i])
        for k in range(b):
            t = (k + 1) / (b + 1)
            out.append(rgba[n - b + k] * (1 - t) + rgba[k] * t)
        rgba = out

    path = os.path.join(a.out_dir, f"{a.name}.webm")
    dst = av.open(path, "w")
    st = dst.add_stream("libvpx-vp9", rate=a.fps)
    st.width = st.height = a.size
    st.pix_fmt = "yuva420p"
    st.options = {"crf": "32", "b": "0", "row-mt": "1", "auto-alt-ref": "0"}
    for arr in rgba:
        fr = av.VideoFrame.from_ndarray(arr.clip(0, 255).astype(np.uint8), format="rgba")
        for p in st.encode(fr):
            dst.mux(p)
    for p in st.encode():
        dst.mux(p)
    dst.close()
    poster = Image.fromarray(rgba[0].clip(0, 255).astype(np.uint8), "RGBA")
    poster.save(os.path.join(a.out_dir, f"{a.name}.png"))
    if a.poster_webp:
        poster.save(os.path.join(a.out_dir, f"{a.name}.webp"), "WEBP", quality=88, method=6)
    print(f"{path}  프레임 {len(rgba)}  {os.path.getsize(path) // 1024}KB")


if __name__ == "__main__":
    main()
