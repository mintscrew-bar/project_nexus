"""픽셀아트 격자 맞추기 — 원본 그림 정리 + 생성 영상 프레임 재픽셀화.

영상 모델(MiniMax H3 등)은 픽셀 경계를 뭉개고 색을 흐린다. 그래서
  1) 넣기 전: 원본은 모델 해상도(1344x768)로 비율만 맞춰 자른다. 격자로 미리 깎지 않는다 —
     AI 픽셀아트는 도트가 고른 격자가 아니라서 미리 깎으면 외곽선·창문 불빛이 뭉개졌다(2026-11-19 실측).
     원본에서 팔레트(128색)만 뽑아 둔다.
  2) 나온 뒤: 모든 프레임을 격자(기본 448x256 = 도트 3px)로 *칸 가운데 색 샘플* 해 줄이고
     원본 팔레트로 다시 칠한 뒤 최근접 확대. 면적 평균(BOX)은 경계 칸이 중간색이 돼 흐려 보였다.
     → 번진 경계가 다시 각지고, 팔레트가 고정이라 프레임마다 색이 출렁이지 않는다.

Windows ComfyUI 파이썬으로 실행 (PIL·numpy):
  python.exe pixel_art.py <원본> <출력.png> [--size 1344 768] [--grid 448 256] [--colors 128]
  → <출력.png>(모델 입력용) · <출력>.palette.png(loop_video.py --pixel 에 넘김) · <출력>.snap.png(재픽셀화 미리보기)
"""
import argparse
import os

import numpy as np
from PIL import Image


def crop_to_aspect(im, gw, gh):
    """격자 비율에 맞게 가운데를 자른다 (늘리면 도트가 직사각형이 된다)"""
    w, h = im.size
    target = gw / gh
    if w / h > target:
        nw = round(h * target)
        x0 = (w - nw) // 2
        return im.crop((x0, 0, x0 + nw, h))
    nh = round(w / target)
    y0 = (h - nh) // 2
    return im.crop((0, y0, w, y0 + nh))


def make_palette(small, colors):
    """격자 크기 그림에서 팔레트 그림(P 모드)을 만든다 — 이후 모든 프레임이 이 색만 쓴다"""
    # 중앙값 분할은 넓은 하늘색에 색을 몰아주고 작은 불빛(등불·창문)을 버린다 → k-평균 계열(FASTOCTREE 보다 안정)
    return small.quantize(colors=colors, method=Image.Quantize.MAXCOVERAGE, kmeans=4)


def snap(frame, grid, palette, scale):
    """한 장을 격자로 줄이고(칸 가운데 색) 팔레트로 다시 칠한 뒤 최근접 확대.
    디더링은 끈다 — 디더 점이 프레임마다 다르게 찍혀 화면 전체가 지글거린다."""
    gw, gh = grid
    small = frame.convert("RGB").resize((gw, gh), Image.NEAREST)
    small = small.quantize(palette=palette, dither=Image.Dither.NONE).convert("RGB")
    if scale > 1:
        small = small.resize((gw * scale, gh * scale), Image.NEAREST)
    return small


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("out")
    ap.add_argument("--size", type=int, nargs=2, default=[1344, 768], metavar=("W", "H"))
    ap.add_argument("--grid", type=int, nargs=2, default=[448, 256], metavar=("W", "H"))
    ap.add_argument("--colors", type=int, default=128)
    a = ap.parse_args()

    # 모델 입력: 비율만 맞춰 자르고 해상도 맞춤 (MiniMax H3 는 32 배수 해상도)
    im = crop_to_aspect(Image.open(a.src).convert("RGB"), *a.size).resize(tuple(a.size), Image.LANCZOS)
    im.save(a.out)
    pal = make_palette(im.resize(tuple(a.grid), Image.NEAREST), a.colors)
    base, _ = os.path.splitext(a.out)
    pal.save(base + ".palette.png")
    scale = a.size[0] // a.grid[0]
    snap(im, a.grid, pal, scale).save(base + ".snap.png")
    print(f"{a.out}: {a.size[0]}x{a.size[1]}, 재픽셀화 격자 {a.grid[0]}x{a.grid[1]} (도트 {scale}px), {a.colors}색")


if __name__ == "__main__":
    main()
