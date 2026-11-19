"""생성 영상 → 끊김 없이 반복되는 배너 영상 (webm vp9 + mp4 h264 + 첫 장면 webp).

Windows ComfyUI 파이썬(PyAV·numpy·PIL 포함)으로 돌린다:
  python.exe loop_video.py <입력.webm> <출력폴더> [--blend 16] [--crf 34]

반복 이음매: 끝의 blend 프레임을 처음 blend 프레임 위에 서서히 겹친다.
  out[j] = 섞기(f[j + L], f[j], j / blend)  (j < blend),  out[j] = f[j]  (j >= blend)
  L = 전체 - blend.  out 의 마지막(f[L-1]) 다음이 out[0] ≈ f[L] 이라 자연스럽게 이어진다.
앞으로 재생 후 거꾸로 재생(핑퐁)은 바람 방향이 뒤집혀 어색해서 쓰지 않는다.
i2v.py --loop 로 만든 영상은 끝이 처음과 같아서 --blend 0 이면 마지막 한 장만 뺀다.

--freeze <마스크.png>: 흰 부분은 모든 프레임에서 첫 장면 그대로 쓴다. 작은 영상 모델은
칼(단단한 물체)을 머리카락처럼 휘게 하고 얼굴을 뭉갰다(2026-11-18) — 카메라가 고정이라
얼굴·몸통·칼을 첫 장면으로 덮어도 어색하지 않다. 가장자리는 마스크에서 흐리게 둔다.
단, 영상이 통째로 흘러내리면(카메라 드리프트) 고정한 칼과 실제 칼이 두 개로 보인다 — --stabilize 와 함께 쓴다.

--pixel <팔레트.png> --grid W H: 픽셀아트 재픽셀화 (pixel_art.py). 영상 모델이 뭉갠 도트 경계를
격자 칸 가운데 색 + 원본 팔레트로 다시 각지게 만든다. 흔들림 보정 뒤·이음매 섞기 전에 한다
(섞인 중간색도 팔레트 색으로 떨어지게 하려면 섞은 뒤에 한 번 더 — 아래 main 참고).

--stabilize: 프레임마다 첫 장면과의 어긋남(평행 이동)을 위상 상관으로 재서 되돌린다.
"카메라 고정" 이라고 써도 LTX 는 3초 동안 25px 쯤 아래로 흘렀고, 끝과 처음을 섞는 구간에
인물이 두 겹으로 보였다(2026-11-18). 되돌린 뒤 가장자리 빈 곳이 안 보이게 조금 확대한다.
"""
import argparse
import os

import av
import numpy as np
from PIL import Image

from pixel_art import snap


def shift_of(ref, img):
    """두 회색 그림의 평행 이동(dy, dx)을 위상 상관으로 잰다 (1/4 크기로 줄여 빠르게, 소수 픽셀 보간)"""
    f = np.fft.fft2(ref) * np.conj(np.fft.fft2(img))
    r = np.fft.ifft2(f / (np.abs(f) + 1e-9)).real
    h, w = r.shape
    y, x = np.unravel_index(np.argmax(r), r.shape)

    def sub(c, m, axis):
        # 꼭짓점 주변 세 값으로 포물선 보간
        if axis == 0:
            a_, b_, c_ = r[(c - 1) % m, x], r[c, x], r[(c + 1) % m, x]
        else:
            a_, b_, c_ = r[y, (c - 1) % m], r[y, c], r[y, (c + 1) % m]
        d = a_ - 2 * b_ + c_
        return c + (0.5 * (a_ - c_) / d if d != 0 else 0)

    dy, dx = sub(y, h, 0), sub(x, w, 1)
    if dy > h / 2:
        dy -= h
    if dx > w / 2:
        dx -= w
    return dy, dx


def stabilize(frames, scale=4):
    """모든 프레임을 첫 장면 위치로 되돌리고, 빈 가장자리가 안 보이게 살짝 확대한다"""
    def gray(arr):
        im = Image.fromarray(arr).convert("L")
        return np.asarray(im.resize((im.width // scale, im.height // scale)), dtype=np.float32)

    ref = gray(frames[0])
    shifts = [shift_of(ref, gray(f)) for f in frames]
    dys = [d[0] * scale for d in shifts]
    dxs = [d[1] * scale for d in shifts]
    print(f"stabilize: dy {min(dys):.1f}~{max(dys):.1f}px, dx {min(dxs):.1f}~{max(dxs):.1f}px")
    h, w = frames[0].shape[:2]
    # 확대는 가로 어긋남만큼만 — 세로로 생기는 빈 띠는 가장자리 픽셀을 늘려 채운다.
    # (배너는 세로 가운데만 보여 줘서 위아래 띠는 거의 안 보인다. 세로까지 확대하면 15% 넘게 잘렸다)
    z = 1 + max(abs(v) for v in dxs) / w * 2 + 0.004
    m = int(max(max(abs(v) for v in dys), max(abs(v) for v in dxs))) + 4
    out = []
    for f, dy, dx in zip(frames, dys, dxs):
        big = Image.fromarray(np.pad(f, ((m, m), (m, m), (0, 0)), mode="edge"))
        # 출력 (u, v) ← 입력 ((u - cx) / z + cx - dx + m, ...) : 되돌리기 + 가운데 기준 확대
        cx, cy = w / 2, h / 2
        coeffs = (1 / z, 0, cx - cx / z - dx + m, 0, 1 / z, cy - cy / z - dy + m)
        out.append(np.asarray(big.transform((w, h), Image.AFFINE, coeffs, resample=Image.BICUBIC)))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("src")
    ap.add_argument("outdir")
    ap.add_argument("--blend", type=int, default=16)
    ap.add_argument("--crf", type=int, default=34)
    ap.add_argument("--fps", type=int, default=24)
    ap.add_argument("--freeze", default=None)
    ap.add_argument("--stabilize", action="store_true")
    ap.add_argument("--pixel", default=None, help="pixel_art.py 가 만든 팔레트 png")
    ap.add_argument("--grid", type=int, nargs=2, default=[448, 256], metavar=("W", "H"))
    a = ap.parse_args()
    pal = Image.open(a.pixel) if a.pixel else None

    def repixel(arr):
        """프레임 하나를 원래 크기 그대로 재픽셀화 (격자 배율은 정수여야 한다)"""
        h_, w_ = arr.shape[:2]
        assert w_ % a.grid[0] == 0 and w_ // a.grid[0] == h_ // a.grid[1], "영상 크기가 격자의 정수배가 아니다"
        return np.asarray(snap(Image.fromarray(arr), a.grid, pal, w_ // a.grid[0]))

    frames = [f.to_ndarray(format="rgb24") for f in av.open(a.src).decode(video=0)]
    if a.stabilize:
        frames = stabilize(frames)
    if a.freeze:
        alpha = np.asarray(Image.open(a.freeze).convert("L").resize(
            (frames[0].shape[1], frames[0].shape[0])), dtype=np.float32)[..., None] / 255.0
        still = frames[0].astype(np.float32)
        frames = [(f.astype(np.float32) * (1 - alpha) + still * alpha).round().astype(np.uint8)
                  for f in frames]
    n, b = len(frames), a.blend
    if b == 0:
        # 끝이 처음과 같게 생성된 영상 — 겹치는 마지막 한 장만 뺀다
        frames = frames[:-1]
        n = len(frames)
    L = n - b
    out = []
    for j in range(L):
        if j < b:
            t = j / b
            # 부드러운 S자 곡선으로 섞어 이음매 구간의 밝기 출렁임을 줄인다
            t = t * t * (3 - 2 * t)
            mix = frames[j + L].astype(np.float32) * (1 - t) + frames[j].astype(np.float32) * t
            out.append(mix.round().astype(np.uint8))
        else:
            out.append(frames[j])
    if pal is not None:
        # 섞은 구간까지 포함해 마지막에 한 번 — 모든 프레임이 같은 격자·같은 팔레트
        out = [repixel(f) for f in out]
    h, w = out[0].shape[:2]
    os.makedirs(a.outdir, exist_ok=True)

    def encode(path, codec, opts, pix="yuv420p"):
        c = av.open(path, "w")
        s = c.add_stream(codec, rate=a.fps)
        s.width, s.height, s.pix_fmt = w, h, pix
        s.options = opts
        for arr in out:
            for p in s.encode(av.VideoFrame.from_ndarray(arr, format="rgb24")):
                c.mux(p)
        for p in s.encode():
            c.mux(p)
        c.close()
        print(f"{path}: {os.path.getsize(path) / 1024:.0f} KB")

    encode(os.path.join(a.outdir, "loop.webm"), "libvpx-vp9",
           {"crf": str(a.crf), "b:v": "0", "row-mt": "1", "deadline": "good", "cpu-used": "2"})
    encode(os.path.join(a.outdir, "loop.mp4"), "libx264",
           {"crf": str(a.crf - 8), "preset": "slow", "movflags": "+faststart"})
    # 첫 장면 — 영상이 뜨기 전·멈춘 그림 설정일 때 보여 준다
    Image.fromarray(out[0]).save(os.path.join(a.outdir, "poster.webp"), quality=85, method=6)
    print(f"{len(out)} frames ({len(out) / a.fps:.2f}s loop), {w}x{h}")


if __name__ == "__main__":
    main()
