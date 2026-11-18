# ComfyUI 꾸미기 제작 도구

프로필 배경 장식(라이브 배경) 그림·영상을 만드는 스크립트. ComfyUI 는 Windows 의 Comfy Desktop 으로 돈다
(`--listen 127.0.0.1,172.22.192.1 --port 8188`, 방화벽은 WSL 대역 8188 만 허용).

## 지금 쓰는 흐름 (수묵 검객, 2026-11-18)

1. 원작 일러스트 — Animagine XL 4.0 (로컬, GTX 1080, 1장 약 70초). 캐릭터를 오른쪽에 두려고 밑그림 img2img(denoise 0.95)를 썼다.
2. 그림 → 반복 영상 — **MiniMax H3** (Comfy Cloud). `workflows/minimax_h3_live_wallpaper.json`
   - 첫 장면·마지막 장면에 같은 그림 → 끝이 처음으로 돌아와 이음매가 없다
   - 프롬프트: 카메라 완전 고정, 잔잔한 움직임만, 같은 화풍·구도 유지
3. 사이트용 변환 — `loop_video.py` (Windows ComfyUI 파이썬으로 실행)
   ```
   python.exe loop_video.py <영상> apps/web/public/cosmetics/banners/<코드> --blend 0 --crf 33
   ```
   → `loop.mp4`·`loop.webm`·`poster.webp`. 화면 부품은 `apps/web/src/components/cosmetics/live-banner.tsx`.

## 로컬 대안 (LTX-Video 2B, GTX 1080)

- `i2v.py` — 그림 → 영상. 3초 약 4분. `workflows/넥서스_그림을_영상으로.json` 은 같은 설정의 ComfyUI 화면용(`make_ui_workflow.py` 로 생성).
- 품질 함정 (실측):
  - "strong wind" 류 프롬프트는 칼이 머리카락처럼 휘고 얼굴이 뭉개진다 → *gentle, subtle, keeping their shape*
  - `--loop`(마지막 장면도 원본으로 고정)는 움직임이 1/50 로 죽는다 (강도 0.5 도 같음)
  - "카메라 고정" 이라 써도 3초에 48px 흘러내린다 → `loop_video.py --stabilize`
- MiniMax H3 는 로컬 불가 — 모델 약 39GB, 문장 인코더 nvfp4 는 RTX 50 전용.

## 라이선스

- Animagine XL 4.0: CreativeML Open RAIL++-M (상업 이용 허용)
- LTX-Video 0.9.8: Open Weights License 0.X (연 매출 1천만 달러 미만 무료, 출력물 권리 주장 없음)
- MiniMax H3: Comfy Cloud 이용 약관을 따른다 — 판매 전 확인 필요
