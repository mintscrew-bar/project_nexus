"""그림 → 짧은 영상 (LTX-Video 2B 0.9.8 distilled, GTX 1080 로컬).

사용: python3 scripts/comfy/i2v.py <그림.png> <출력.webm> "<움직임 프롬프트>" [--w 1536 --h 640 --frames 49]
LTX 는 가로·세로가 32의 배수, 프레임 수가 8n+1 이어야 한다. distilled 는 8스텝·CFG 1.
라이선스: LTX-Video Open Weights License 0.X — 연 매출 1천만 달러 미만 무료, 출력물 권리 주장 없음.
"""
import argparse
import random

from comfy_api import fetch, run, upload

NEG = (
    "worst quality, inconsistent motion, blurry, jittery, distorted, camera shake, "
    "zoom, pan, cut, text, watermark, morphing face, extra limbs"
)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("image")
    ap.add_argument("out")
    ap.add_argument("prompt")
    ap.add_argument("--w", type=int, default=1536)
    ap.add_argument("--h", type=int, default=640)
    ap.add_argument("--frames", type=int, default=49)
    ap.add_argument("--steps", type=int, default=8)
    ap.add_argument("--seed", type=int, default=None)
    ap.add_argument("--fps", type=float, default=24)
    a = ap.parse_args()
    seed = a.seed if a.seed is not None else random.randint(0, 2**31)
    name = upload(a.image)

    wf = {
        "1": {"class_type": "CheckpointLoaderSimple",
              "inputs": {"ckpt_name": "ltxv-2b-0.9.8-distilled.safetensors"}},
        "2": {"class_type": "CLIPLoader",
              "inputs": {"clip_name": "t5xxl_fp8_e4m3fn_scaled.safetensors", "type": "ltxv"}},
        "3": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": a.prompt}},
        "4": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": NEG}},
        "5": {"class_type": "LoadImage", "inputs": {"image": name}},
        # 첫 장면을 살짝 압축해 넣으면 움직임이 덜 굳는다(LTX 권장)
        "6": {"class_type": "LTXVPreprocess", "inputs": {"image": ["5", 0], "img_compression": 30}},
        "7": {"class_type": "LTXVImgToVideo",
              "inputs": {"positive": ["3", 0], "negative": ["4", 0], "vae": ["1", 2],
                         "image": ["6", 0], "width": a.w, "height": a.h,
                         "length": a.frames, "batch_size": 1, "strength": 1.0}},
        "8": {"class_type": "LTXVConditioning",
              "inputs": {"positive": ["7", 0], "negative": ["7", 1], "frame_rate": a.fps}},
        "9": {"class_type": "LTXVScheduler",
              "inputs": {"steps": a.steps, "max_shift": 2.05, "base_shift": 0.95,
                         "stretch": True, "terminal": 0.1, "latent": ["7", 2]}},
        "10": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "11": {"class_type": "SamplerCustom",
               "inputs": {"model": ["1", 0], "add_noise": True, "noise_seed": seed, "cfg": 1.0,
                          "positive": ["8", 0], "negative": ["8", 1], "sampler": ["10", 0],
                          "sigmas": ["9", 0], "latent_image": ["7", 2]}},
        "12": {"class_type": "VAEDecode", "inputs": {"samples": ["11", 0], "vae": ["1", 2]}},
        "13": {"class_type": "SaveWEBM",
               "inputs": {"images": ["12", 0], "filename_prefix": "live_video", "codec": "vp9",
                          "fps": a.fps, "crf": 24}},
    }
    outs, took = run(wf, poll=5)
    o = outs["13"]
    item = (o.get("images") or o.get("videos") or o.get("gifs"))[0]
    fetch(item, a.out)
    print(f"saved {a.out} seed={seed} {took:.0f}s")


if __name__ == "__main__":
    main()
