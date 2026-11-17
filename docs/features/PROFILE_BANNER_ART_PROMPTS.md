# 프로필 배경 일러스트 — 그림 생성 프롬프트

프로필 배경 장식(Task 22)용 원작 캐릭터 일러스트를 그림 생성 도구(Codex 등)로 만들 때 쓰는 프롬프트.
그림은 아래 3장이 한 세트이고, 움직임(숨쉬기·머리카락·옷자락 흔들림·눈 깜빡임·깊이감·입자)은 사이트 코드가 붙인다.

## 한 세트에 필요한 파일

| 파일 | 크기 | 내용 |
| --- | --- | --- |
| `bg.png` | 3072×1024 (3:1) | 캐릭터 **없는** 배경만. 투명 아님 |
| `char.png` | 2048×2048 | 캐릭터만, **투명 배경**. 허리 위 반신 이상, 화면 오른쪽에 놓일 자세 |
| `char_blink.png` | 2048×2048 | `char.png` 와 **완전히 같은 그림**에서 눈만 감은 것 (편집 기능으로 눈 부분만 고친다) |
| (선택) `fx.png` | 3072×1024 | 앞쪽에 겹칠 빛·안개·꽃잎 등, 투명 배경 |

**배치 규칙** — 프로필 화면에서 배너 왼쪽 아래에는 프로필 사진과 닉네임이 겹치고, 아래 25%는 어둡게 눌린다.
캐릭터 얼굴과 중요한 부분은 **오른쪽 60%, 위쪽 75%** 안에 둔다.

## 저작권 주의

- 특정 게임·애니·작가 이름(니케, 리그 오브 레전드, 원신 등)이나 실존 캐릭터를 프롬프트에 넣지 않는다. 비슷하게 베끼면 판매할 수 없다.
- 상업적 이용이 허용되는 도구·요금제로 만든다(이용 약관의 출력물 권리 확인).
- 그림 안에 글자·로고·서명·워터마크가 없어야 한다.

## 공통 문구 (모든 프롬프트 끝에 붙인다)

```text
Original character design, not based on any existing game, anime or franchise.
High-quality 2D anime game illustration, gacha-game key-art quality, clean line art, painterly cel shading, rich rim lighting, cinematic composition.
No text, no logo, no watermark, no signature, no UI elements.
```

## 프롬프트 만드는 법 (캐릭터 하나당 3번)

### 1) 배경 `bg.png`

```text
Wide panoramic background illustration, aspect ratio 3:1, 3072x1024.
[배경 설명]
No characters, no people. Leave the right 60% of the image visually calm enough for a character to stand in front of it.
Depth: clear foreground, midground and far background layers. Atmospheric perspective.
[공통 문구]
```

### 2) 캐릭터 `char.png`

```text
Single character, waist-up to knee-up, three-quarter view, facing slightly left toward the viewer, confident pose.
Transparent background (PNG with alpha), character fully isolated, no ground, no shadow on background.
Long hair and loose clothing parts (cape, ribbons, sleeves, tails) spread out clearly away from the body so they can sway in animation.
Eyes open, clearly drawn eyelids.
[캐릭터 설명]
Lighting matches this background: [배경 한 줄 요약].
[공통 문구]
```

### 3) 눈 감은 그림 `char_blink.png` — **편집** 기능으로

`char.png` 를 넣고 눈 부분만 선택해서:

```text
Edit only the eyes: same character, eyes gently closed (natural blink), keep everything else pixel-identical — same pose, hair, clothes, colors, framing and transparent background.
```

## 캐릭터 6종 제안

사이트에 이미 있는 꾸미기(흑룡·불꽃·벚꽃·번개·달·박쥐)와 결이 이어지게 골랐다.

### A. 수묵 흑룡 검객 — `ink_swordsman`

- 배경: `Ink-wash East Asian mountain landscape at dusk, layered misty peaks, a huge red sun low on the horizon, a black ink dragon silhouette coiling through the clouds in the far distance, scattered pine trees on cliffs, rice-paper texture.`
- 캐릭터: `A young swordswoman in a black-and-white hanbok-inspired battle robe with red cord accents, long black hair tied high with a red ribbon, holding a slender straight sword with ink dripping off the blade like brush strokes, calm sharp gaze, wide flowing sleeves.`

### B. 여우불 무녀 — `fox_shrine`

- 배경: `Night shrine on a mountain, rows of glowing paper lanterns, a red torii-like wooden gate (generic, not a real place), drifting blue spirit flames, full moon behind thin clouds.`
- 캐릭터: `A fox-spirit shrine maiden with silver hair and white fox ears, three fluffy white fox tails spread out behind her, white and crimson ceremonial robes, holding a floating blue flame in one palm, mysterious playful smile.`

### C. 네온 저격수 — `neon_sniper`

- 배경: `Rainy cyberpunk city rooftop at night, neon signs in pink and cyan (no readable text), wet reflective floor, distant skyscrapers with lit windows, light rain streaks.`
- 캐릭터: `A cool sniper girl with a short asymmetric bob in cyan and black, glowing visor pushed up on her head, oversized techwear jacket with loose straps, long sniper rifle resting on her shoulder, headphones, chewing gum, raincoat tails flowing.`

### D. 벚꽃 검사 — `sakura_blade`

- 배경: `Endless cherry blossom grove at golden hour, petals swirling in the wind, a wooden bridge over a small river, soft pink and gold light, distant hills.`
- 캐릭터: `A gentle but strong swordsman boy with long pastel pink hair in a low ponytail, white and pink layered kimono-style coat, katana at his waist with hand on the hilt, petals caught in his hair, serene smile.`

### E. 화염 마도사 — `flame_mage`

- 배경: `Volcanic ruins at night, rivers of lava, floating embers, broken stone pillars, dark red sky with glowing ash clouds.`
- 캐릭터: `A fierce fire mage girl with long crimson hair that turns into flame at the tips, black and gold battle dress with a long torn cape, fire swirling around her raised hand, glowing amber eyes, confident grin.`

### F. 달빛 흡혈귀 — `moon_vampire`

- 배경: `Gothic castle balcony under a giant full moon, bats flying across the moon, purple night sky, stone gargoyles, roses climbing the railing.`
- 캐릭터: `An elegant vampire noble with long wavy silver-lavender hair, red eyes, black and deep purple victorian coat with a high collar and long coattails, holding a wine glass of glowing red liquid, small bat wings on the back of the head, aristocratic smirk.`

## 받은 뒤 할 일 (코드 쪽)

- [ ] 그림 세트를 `apps/web/public/cosmetics/banners/<코드>/` 에 넣는다 (bg.webp, char.webp, char_blink.webp, fx.webp)
- [ ] 머리카락·옷자락 흔들림 영역을 정한다 (그림을 보고 흔들 부분을 지정)
- [ ] 간이 Live2D 장치: 숨쉬기·흔들림(메시 변형)·눈 깜빡임·마우스 깊이감·입자
