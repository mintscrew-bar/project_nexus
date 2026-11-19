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

## 픽셀아트 배경 (픽셀 기사, 2026-11-19)

영상 모델은 도트 경계를 뭉갠다 → 넣기 전엔 그대로, 나온 뒤에 격자·팔레트로 다시 깎는다.

1. `pixel_art.py <원본> pixel_knight_input.png` → 모델 입력(1344x768) · `.palette.png`(128색) · `.snap.png`(미리보기)
   - 원본을 미리 격자로 깎으면 외곽선·창문 불빛이 뭉개졌다 → 비율만 맞춘다
2. `workflows/minimax_h3_pixel_knight.json` (Comfy Cloud) — 입력 그림을 `pixel_knight_input.png` 로 올리고 실행.
   1344x768, 6초. 프롬프트에 *crisp hard-edged pixels, no anti-aliasing, stepped sprite motion* + 움직일 것 목록.
3. `loop_video.py <영상> <출력> --blend 0 --pixel <팔레트.png> --grid 448 256` (필요하면 `--stabilize`)
   - 칸 가운데 색 샘플 + 고정 팔레트(디더 없음) → 프레임마다 색이 출렁이지 않는다. 면적 평균은 흐려서 안 씀

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

## 아바타 장식 — 흑룡 (2026-11-19)

코드로 그린 용(픽셀·벡터)은 붓맛이 안 나서 그림 모델로 만든다.

1. 그림: `cosmetic_art.py avatar <폴더> [--thin]` — 고리 밑그림 + Animagine XL 그림→그림.
   머리만 고치기는 `cosmetic_art.py head <폴더> --src <_raw.png> --ellipse CX CY RX RY`.
2. 움직임(갈기·먹 흩날림): **MiniMax H3 (Comfy Cloud)** `workflows/minimax_h3_ink_dragon_avatar.json`
   — 입력 그림을 `ink_dragon_avatar_input.png`(768×768, 종이째)로 올리고 실행. 6초.
   - 로컬 LTX 2B 는 실패: "부드럽게·형태 유지" 면 거의 정지(프레임당 0.05), 세게 시키면 고리가 뭉개짐.
     고리 회전은 어떤 프롬프트로도 안 됐다 → 회전은 사이트에서 CSS 로 돌린다.
3. 후처리: `avatar_video.py <영상> <폴더> --name ink_dragon --blend 12`
   → 종이 걷기(색을 알파로) · 고리 띠만 남기기 · 앞뒤 이음 · VP9+알파 webm 384² + 첫 장면 png.
   크롬·엣지·파이어폭스는 투명 영상, 사파리는 png 로 대신한다.
