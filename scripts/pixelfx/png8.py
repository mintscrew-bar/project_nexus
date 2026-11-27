#!/usr/bin/env python3
"""RGBA PNG → 팔레트(인덱스) PNG. 픽셀 그림 시트는 색이 256개를 넘지 않는 경우가 많아 용량이 크게 준다.

색이 256개를 넘으면 그대로 두고 알린다(조용히 색을 바꾸지 않는다). --quantize 를 주면 색 공간을
메디안 컷으로 255칸으로 나눠(드물어도 눈에 띄는 창문 주황·눈 빨강이 살아남게) 가장 가까운 색으로 바꾼다.
쓰임: python3 png8.py 입력.png [출력.png] [--quantize]
"""
import struct, sys, zlib


def read_png(path):
    d = open(path, "rb").read()
    assert d[:8] == b"\x89PNG\r\n\x1a\n"
    i, idat, w = 8, b"", 0
    while i < len(d):
        l = struct.unpack(">I", d[i:i + 4])[0]
        t, c = d[i + 4:i + 8], d[i + 8:i + 8 + l]
        if t == b"IHDR":
            w, h, depth, ctype = struct.unpack(">IIBB", c[:10])
            assert depth == 8 and ctype == 6, "RGBA 8비트만 받는다"
        elif t == b"IDAT":
            idat += c
        i += 12 + l
    raw, bpp, stride = zlib.decompress(idat), 4, w * 4
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f, line = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        for x in range(stride):
            a = line[x - bpp] if x >= bpp else 0
            b, cc = prev[x], prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pp = a + b - cc; pa, pb, pc = abs(pp - a), abs(pp - b), abs(pp - cc)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else cc)) & 255
        rows.append(bytes(line)); prev = line
    return w, h, rows


def median_cut(count, n):
    """색 상자를 가장 긴 축(쓰인 횟수로 가중)의 중앙에서 반으로 나누길 n칸이 될 때까지. 칸마다 가중 평균색."""
    boxes = [list(count)]
    while len(boxes) < n:
        best, bi, axis = -1, -1, 0
        for i, b in enumerate(boxes):
            if len(b) < 2: continue
            for ax in range(4):
                vals = [c[ax] for c in b]; span = max(vals) - min(vals)
                if span > best: best, bi, axis = span, i, ax
        if bi < 0: break
        b = sorted(boxes.pop(bi), key=lambda c: c[axis])
        total, acc, cut = sum(count[c] for c in b), 0, 1
        for k, c in enumerate(b):
            acc += count[c]
            if acc >= total / 2: cut = max(1, min(len(b) - 1, k + 1)); break
        boxes += [b[:cut], b[cut:]]
    out = []
    for b in boxes:
        wsum = sum(count[c] for c in b)
        out.append(bytes(round(sum(c[ax] * count[c] for c in b) / wsum) for ax in range(4)))
    return out


def chunk(t, c):
    return struct.pack(">I", len(c)) + t + c + struct.pack(">I", zlib.crc32(t + c) & 0xFFFFFFFF)


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    quant = "--quantize" in sys.argv
    src, dst = args[0], args[1] if len(args) > 1 else args[0]
    w, h, rows = read_png(src)
    norm = lambda px: b"\0\0\0\0" if px[3] == 0 else px  # 투명은 하나로
    count = {}
    for r in rows:
        for x in range(w):
            px = norm(r[x * 4:x * 4 + 4]); count[px] = count.get(px, 0) + 1
    if len(count) > 256 and not quant:
        print(f"{src}: 색이 {len(count)}개라 그대로 둔다 (--quantize 로 줄일 수 있다)"); return
    keep = list(count) if len(count) <= 256 else median_cut(count, 255)
    pal = {c: i for i, c in enumerate(keep)}
    near = {}
    def index(px):
        if px in pal: return pal[px]
        if px not in near:
            near[px] = min(range(len(keep)), key=lambda i: sum((a - b) ** 2 for a, b in zip(px, keep[i])))
        return near[px]
    idx_rows = []
    for r in rows:
        out = bytearray([0])  # 필터 없음 — 인덱스 그림은 그대로가 잘 눌린다
        for x in range(w): out.append(index(norm(r[x * 4:x * 4 + 4])))
        idx_rows.append(bytes(out))
    colors = keep
    if near: print(f"{src}: {len(count)}색 중 {len(near)}색을 가까운 색으로 바꿨다")
    plte = b"".join(c[:3] for c in colors)
    trns = bytes(c[3] for c in colors)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 3, 0, 0, 0)) + chunk(b"PLTE", plte)
    if any(a != 255 for a in trns): png += chunk(b"tRNS", trns)
    png += chunk(b"IDAT", zlib.compress(b"".join(idx_rows), 9)) + chunk(b"IEND", b"")
    open(dst, "wb").write(png)
    print(f"{src}: {len(colors)}색, {len(png)} 바이트")


main()
