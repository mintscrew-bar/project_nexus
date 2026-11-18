"""ComfyUI 화면용 워크플로(.json) — 그림 → 반복 영상 (LTX-Video 2B, GTX 1080).

기본 템플릿(MiniMax H3 이미지→비디오)처럼 설명 메모 · 시작 그림 · 크기 맞춤 · 설정 묶음 · 저장
순서로 왼쪽에서 오른쪽으로 놓는다. ComfyUI 화면에 끌어다 놓거나 Workflows 목록에서 연다.
사용: python3 make_ui_workflow.py <출력.json> [시작그림이름]
"""
import json
import sys

out = sys.argv[1]
start_image = sys.argv[2] if len(sys.argv) > 2 else "ink_swordsman.png"

nodes, links = [], []
_lid = [0]


def node(nid, typ, pos, size, widgets=None, title=None, inputs=(), outputs=(), color=None):
    n = {
        "id": nid, "type": typ, "pos": list(pos), "size": list(size), "flags": {},
        "order": nid, "mode": 0,
        "inputs": [{"name": nm, "type": t, "link": None} for nm, t in inputs],
        "outputs": [{"name": nm, "type": t, "links": [], "slot_index": i} for i, (nm, t) in enumerate(outputs)],
        "properties": {"Node name for S&R": typ},
        "widgets_values": widgets or [],
    }
    if title:
        n["title"] = title
    if color:
        n["color"], n["bgcolor"] = color
    nodes.append(n)
    return n


def link(a, a_slot, b, b_slot, typ):
    _lid[0] += 1
    lid = _lid[0]
    links.append([lid, a["id"], a_slot, b["id"], b_slot, typ])
    a["outputs"][a_slot]["links"].append(lid)
    b["inputs"][b_slot]["link"] = lid


NOTE_C = ("#432", "#653")      # 설명 메모
INPUT_C = ("#223", "#335")     # 바꿔 볼 칸
X0 = 0

# ── 1열: 설명 ──
node(1, "MarkdownNote", (X0, 0), (420, 640), [
"""## 그림 → 반복 영상 (넥서스 프로필 배경)

**모델** — 이미 받아 둠
- 영상: `ltxv-2b-0.9.8-distilled` (LTX-Video 2B)
- 문장 인코더: `t5xxl_fp8_e4m3fn_scaled`
- 라이선스: 연 매출 1천만 달러 미만 무료, 출력물 권리 주장 없음

**쓰는 법**
1. **③ 시작 그림**에 움직일 그림을 고른다 (업로드 가능)
2. **① 움직임 설명**을 영어로 고친다
3. **④ 길이**와 **⑤ 시드**를 정한다
4. 오른쪽 위 ▷ 실행 — 3초 기준 약 4분 (GTX 1080)
5. 결과: `ComfyUI-Shared/output/my_video_…webm`

**잘 나오게 하는 요령**
- 작게 움직이려면 *gentle, subtle, sway slightly, keeping their shape*
- *strong wind*·*flow* 같은 말은 칼·얼굴까지 휘게 만든다
- 마음에 안 들면 **시드만 바꿔** 여러 번 돌려 고른다
- 얼굴·칼이 뭉개지는 건 사이트에 붙일 때 고정 처리로 막는다 (Claude 에게)
"""], title="사용법", color=NOTE_C)

node(2, "MarkdownNote", (X0, 670), (420, 260), [
"""### 길이·시간표 (24fps)
| length | 길이 | 생성 시간 |
|---|---|---|
| 49 | 2초 | 약 2.5분 |
| 73 | 3초 | 약 4분 |
| 97 | 4초 | 약 5.5분 |

길이는 **8의 배수 + 1** 이어야 한다.
가로·세로는 32의 배수. 배너는 1536 × 640.
"""], title="설정 참고표", color=NOTE_C)

# ── 2열: 시작 그림 ──
X1 = 470
img = node(10, "LoadImage", (X1, 0), (420, 360), [start_image, "image"], title="③ 시작 그림",
           outputs=[("IMAGE", "IMAGE"), ("MASK", "MASK")], color=INPUT_C)
scale = node(11, "ImageScale", (X1, 390), (420, 130), ["lanczos", 1536, 640, "center"],
             title="배너 크기로 맞춤 (1536×640)", inputs=[("image", "IMAGE")], outputs=[("IMAGE", "IMAGE")])
prep = node(12, "LTXVPreprocess", (X1, 550), (420, 60), [30], title="그림 전처리 (움직임이 덜 굳게)",
            inputs=[("image", "IMAGE")], outputs=[("output", "IMAGE")])

# ── 3열: 문장 ──
X2 = 940
ckpt = node(20, "CheckpointLoaderSimple", (X2, 0), (420, 100), ["ltxv-2b-0.9.8-distilled.safetensors"],
            title="영상 모델 (LTX 2B)", outputs=[("MODEL", "MODEL"), ("CLIP", "CLIP"), ("VAE", "VAE")])
clip = node(21, "CLIPLoader", (X2, 130), (420, 110), ["t5xxl_fp8_e4m3fn_scaled.safetensors", "ltxv", "default"],
            title="문장 인코더", outputs=[("CLIP", "CLIP")])
pos = node(22, "CLIPTextEncode", (X2, 270), (420, 220), [
    "A still ink-wash painting gently comes alive. Subtle idle animation only. A soft breeze makes the long "
    "black ponytail and red ribbons sway slightly in place, keeping their shape. The black ink dragon breathes "
    "slowly. Clouds drift very slowly. A few red ink droplets float. The camera is completely static. "
    "Nothing changes shape, no new objects appear."],
    title="① 움직임 설명 (영어)", inputs=[("clip", "CLIP")], outputs=[("CONDITIONING", "CONDITIONING")], color=INPUT_C)
neg = node(23, "CLIPTextEncode", (X2, 520), (420, 130), [
    "worst quality, inconsistent motion, blurry, jittery, distorted, camera shake, zoom, pan, cut, text, "
    "watermark, morphing face, extra limbs, bent sword"],
    title="② 피할 것", inputs=[("clip", "CLIP")], outputs=[("CONDITIONING", "CONDITIONING")])

# ── 4열: 영상 설정 ──
X3 = 1410
i2v = node(30, "LTXVImgToVideo", (X3, 0), (380, 230), [1536, 640, 73, 1, 1.0],
           title="④ 크기·길이 (length 49=2초 73=3초 97=4초)",
           inputs=[("positive", "CONDITIONING"), ("negative", "CONDITIONING"), ("vae", "VAE"), ("image", "IMAGE")],
           outputs=[("positive", "CONDITIONING"), ("negative", "CONDITIONING"), ("latent", "LATENT")], color=INPUT_C)
cond = node(31, "LTXVConditioning", (X3, 260), (380, 80), [24],
            title="프레임 속도 (24)", inputs=[("positive", "CONDITIONING"), ("negative", "CONDITIONING")],
            outputs=[("positive", "CONDITIONING"), ("negative", "CONDITIONING")])
sched = node(32, "LTXVScheduler", (X3, 370), (380, 180), [8, 2.05, 0.95, True, 0.1],
             title="스텝 (distilled 는 8)", inputs=[("latent", "LATENT")], outputs=[("SIGMAS", "SIGMAS")])
sel = node(33, "KSamplerSelect", (X3, 580), (380, 60), ["euler"], outputs=[("SAMPLER", "SAMPLER")])
samp = node(34, "SamplerCustom", (X3, 670), (380, 250), [True, 7, "fixed", 1.0],
            title="⑤ 생성 — 시드를 바꾸면 다른 움직임",
            inputs=[("model", "MODEL"), ("positive", "CONDITIONING"), ("negative", "CONDITIONING"),
                    ("sampler", "SAMPLER"), ("sigmas", "SIGMAS"), ("latent_image", "LATENT")],
            outputs=[("output", "LATENT"), ("denoised_output", "LATENT")], color=INPUT_C)

# ── 5열: 저장 ──
X4 = 1840
dec = node(40, "VAEDecode", (X4, 0), (300, 60), [], inputs=[("samples", "LATENT"), ("vae", "VAE")],
           outputs=[("IMAGE", "IMAGE")])
save = node(41, "SaveWEBM", (X4, 100), (520, 420), ["my_video", "vp9", 24, 24],
            title="결과 저장 (output 폴더, 화면에서 바로 재생)", inputs=[("images", "IMAGE")])

# ── 연결 ──
link(img, 0, scale, 0, "IMAGE")
link(scale, 0, prep, 0, "IMAGE")
link(clip, 0, pos, 0, "CLIP")
link(clip, 0, neg, 0, "CLIP")
link(pos, 0, i2v, 0, "CONDITIONING")
link(neg, 0, i2v, 1, "CONDITIONING")
link(ckpt, 2, i2v, 2, "VAE")
link(prep, 0, i2v, 3, "IMAGE")
link(i2v, 0, cond, 0, "CONDITIONING")
link(i2v, 1, cond, 1, "CONDITIONING")
link(i2v, 2, sched, 0, "LATENT")
link(ckpt, 0, samp, 0, "MODEL")
link(cond, 0, samp, 1, "CONDITIONING")
link(cond, 1, samp, 2, "CONDITIONING")
link(sel, 0, samp, 3, "SAMPLER")
link(sched, 0, samp, 4, "SIGMAS")
link(i2v, 2, samp, 5, "LATENT")
link(samp, 0, dec, 0, "LATENT")
link(ckpt, 2, dec, 1, "VAE")
link(dec, 0, save, 0, "IMAGE")

wf = {
    "last_node_id": max(n["id"] for n in nodes), "last_link_id": _lid[0],
    "nodes": nodes, "links": links,
    "groups": [
        {"title": "시작 그림", "bounding": [X1 - 15, -45, 450, 670], "color": "#3f789e", "font_size": 22},
        {"title": "움직임 설명", "bounding": [X2 - 15, -45, 450, 710], "color": "#8A8", "font_size": 22},
        {"title": "영상 설정", "bounding": [X3 - 15, -45, 410, 980], "color": "#b06634", "font_size": 22},
        {"title": "결과", "bounding": [X4 - 15, -45, 550, 580], "color": "#88A", "font_size": 22},
    ],
    "config": {}, "extra": {"ds": {"scale": 0.6, "offset": [40, 80]}}, "version": 0.4,
}
json.dump(wf, open(out, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("ok", out)
