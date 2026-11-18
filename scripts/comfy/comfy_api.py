"""ComfyUI(Windows, GTX 1080) HTTP API 도우미 — 그림·영상 생성 스크립트가 함께 쓴다.

ComfyUI 는 Windows 의 Comfy Desktop 으로 돌고, 실행 인자 --listen 127.0.0.1,172.22.192.1
로 WSL 쪽 주소에 열려 있다(방화벽: WSL 대역 8188 허용). 결과는 Windows 의
AppData/Local/Comfy-Desktop/ComfyUI-Shared/output 에도 남는다.
"""
import json
import os
import time
import urllib.parse
import urllib.request
import uuid

HOST = os.environ.get("COMFY_HOST", "http://172.22.192.1:8188")


def call(path, data=None, timeout=60):
    req = urllib.request.Request(
        HOST + path,
        data=json.dumps(data).encode() if data is not None else None,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as r:
        return r.read()


def upload(path):
    """입력 그림을 /upload/image 로 올리고 ComfyUI 안의 이름을 돌려준다 (multipart)"""
    boundary = uuid.uuid4().hex
    fname = os.path.basename(path)
    with open(path, "rb") as f:
        data = f.read()
    body = (
        f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="{fname}"\r\n'
        "Content-Type: image/png\r\n\r\n"
    ).encode() + data + (
        f'\r\n--{boundary}\r\nContent-Disposition: form-data; name="overwrite"\r\n\r\ntrue'
        f"\r\n--{boundary}--\r\n"
    ).encode()
    req = urllib.request.Request(
        HOST + "/upload/image",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        return json.loads(r.read())["name"]


def run(workflow, poll=3, progress=True):
    """작업을 넣고 끝날 때까지 기다린 뒤 outputs 를 돌려준다. 실패하면 오류 내용으로 끝낸다."""
    pid = json.loads(call("/prompt", {"prompt": workflow}))["prompt_id"]
    t0 = time.time()
    last = -1
    while True:
        time.sleep(poll)
        hist = json.loads(call(f"/history/{pid}"))
        if pid in hist:
            h = hist[pid]
            if h.get("status", {}).get("status_str") == "error":
                raise SystemExit(json.dumps(h["status"], ensure_ascii=False)[:3000])
            return h["outputs"], time.time() - t0
        if progress:
            m = int((time.time() - t0) // 60)
            if m != last:
                last = m
                print(f"  ... {m}분 경과", flush=True)


def fetch(item, out_path):
    """outputs 의 파일 하나(images/gifs/videos 항목)를 받아 저장한다"""
    q = urllib.parse.urlencode({k: item[k] for k in ("filename", "subfolder", "type")})
    with open(out_path, "wb") as f:
        f.write(call(f"/view?{q}", timeout=300))
