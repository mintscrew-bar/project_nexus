# pixelfx 원본 효과

꾸미기 그림 중 pixelfx(https://github.com/patch-gg/pixelfx, MIT)로 그려 스프라이트 시트로 구운 것의 원본 효과 파일.
사이트는 구운 PNG만 쓰고, 이 파일들은 다시 고쳐 굽고 싶을 때만 쓴다.

## 카드 장식 (`effects.tsx` 의 `CARD_SHEETS`)

모든 카드는 **110×92 칸**이다 — 칸 크기가 같아야 로비에 여러 카드가 나란히 있을 때 픽셀 크기가 맞는다.

화염을 뺀 다섯 장은 **한 장면(scene-\*)** 이다: 배경 소품을 여러 조각(`bg-*.js` 의 `export function`)으로 나누고,
그 사이사이에 pixelfx 날씨 효과를 끼워 그린다 — 소품 위에 효과를 얹으면 효과가 소품 밑에 깔리기 때문.
배경째 움직이는 불투명 시트라 `png8.py --quantize` 로 255색 팔레트 PNG 로 줄인다(대개 1/3).
`bg-*.png`(한 장)는 시트가 뜨기 전에 보이는 바탕이다.

| 카드                    | 장면 파일              | 끼운 pixelfx 효과                                  | 시트 (`apps/web/public/cosmetics/cards/`) |
| ----------------------- | ---------------------- | -------------------------------------------------- | ----------------------------------------- |
| 픽셀 화염 `FX_FIRE`     | `card-blaze.js`        | (불벽 단독, 투명 시트를 `bg-fire.png` 위에)        | `fire-blaze.png` 60장 20fps               |
| 통통 슬라임 `FX_SLIME`  | `cards/scene-slime.js` | weather/fireflies, critters/slime                  | `scene-slime.png` 144장 12fps             |
| 꼬마 유령 `FX_GHOST`    | `cards/scene-ghost.js` | weather/fog, critters/ghost                        | `scene-ghost.png` 144장 12fps             |
| 박쥐 떼 `FX_BATS`       | `cards/scene-bats.js`  | weather/clouds, weather/fog, critters/bat          | `scene-bats.png` 144장 12fps              |
| 전설의 검 `FX_SWORD`    | `cards/scene-sword.js` | weather/god-rays (검·제단은 `card-sword.js`)       | `scene-sword.png` 120장 12fps             |
| 천둥번개 `FX_LIGHTNING` | `cards/card-storm.js`  | weather/storm (그 위에 `bg-storm.js` 의 바다·등대) | `storm.png` 150장 15fps                   |

`cards/_card.js` 는 카드 크기와 라이브러리 효과를 카드 위 자리에 찍는 `stamp`, `cards/_bg.js` 는 배경 그리기 도구,
`cards/_libcloud.js` 는 weather/clouds 의 구름 그리기를 옮긴 것이다.

## 다시 굽기

1. pixelfx 를 받아 효과 파일을 넣는다.
   ```bash
   git clone https://github.com/patch-gg/pixelfx
   mkdir -p pixelfx/src/fx/cards && cp scripts/pixelfx/cards/*.js pixelfx/src/fx/cards/
   cp scripts/pixelfx/card-blaze.js pixelfx/src/fx/fire/
   ```
2. 그려 보고(`records/<id>/contact.png`) 고친다.
   ```bash
   cd pixelfx && node tools/render.mjs cards/card-slime
   ```
3. 시트로 굽는다. 장면 시트는 굽고 나서 `python3 scripts/pixelfx/png8.py <시트>.png <시트>.png --quantize`. 빛 번짐은 시트에 반투명 색으로 구워진다 — 움직이는 효과는 `light` 0.5,
   불은 0.35(세게 구우면 카드 아래 이름 가림막과 겹쳐 밑동이 회색으로 탁해진다). 배경은 기본값.
   ```bash
   node tools/render.mjs cards/card-slime --sheet --opts '{"light":0.5}'
   node tools/render.mjs fire/card-blaze --sheet --opts '{"light":0.35}'
   node tools/render.mjs cards/bg-slime --sheet
   cp records/cards/card-slime/card-slime.png ../apps/web/public/cosmetics/cards/slime.png
   ```
4. 장수·가로 칸 수가 바뀌었으면 `effects.tsx` 의 `CARD_SHEETS` 값도 맞춘다
   (`records/<id>/<name>.json` 의 `meta.pixelfx`).

`node tools/check.mjs` 는 불에 「캔버스 밖에 그림」 경고를 낸다 — 양옆 불이 카드 가장자리에서
잘려 불벽이 이어져 보이게 일부러 넘긴 것이라 그대로 둔다.
