# pixelfx 원본 효과

꾸미기 그림 중 pixelfx(https://github.com/patch-gg/pixelfx, MIT)로 그려 스프라이트 시트로 구운 것의 원본 효과 파일.
사이트는 구운 PNG만 쓰고, 이 파일들은 다시 고쳐 굽고 싶을 때만 쓴다.

## 카드 장식 (`effects.tsx` 의 `CARD_SHEETS`)

모든 카드는 **110×92 칸**이다 — 칸 크기가 같아야 로비에 여러 카드가 나란히 있을 때 픽셀 크기가 맞는다.
카드 하나는 멈춘 배경 한 장(`bg-*.png`) 위에 움직이는 시트(`*.png`)를 겹친 것이다.

| 카드                    | 배경 효과           | 움직이는 효과                                     | 구운 파일 (`apps/web/public/cosmetics/cards/`) |
| ----------------------- | ------------------- | ------------------------------------------------- | ---------------------------------------------- |
| 픽셀 화염 `FX_FIRE`     | `cards/bg-fire.js`  | `card-blaze.js` (`fire/` 에 넣는다)               | `bg-fire.png`, `fire-blaze.png`                |
| 통통 슬라임 `FX_SLIME`  | `cards/bg-slime.js` | `cards/card-slime.js` (critters/slime 두 마리)    | `bg-slime.png`, `slime.png`                    |
| 꼬마 유령 `FX_GHOST`    | `cards/bg-ghost.js` | `cards/card-ghost.js` (critters/ghost 두 마리)    | `bg-ghost.png`, `ghost.png`                    |
| 박쥐 떼 `FX_BATS`       | `cards/bg-bats.js`  | `cards/card-bats.js` (critters/bat 세 마리)       | `bg-bats.png`, `bats.png`                      |
| 전설의 검 `FX_SWORD`    | `cards/bg-sword.js` | `cards/card-sword.js` (바위에 꽂힌 검, 직접 그림) | `bg-sword.png`, `sword.png`                    |
| 천둥번개 `FX_LIGHTNING` | `cards/bg-storm.js` | `cards/card-storm.js` (lightning/_lib 번개)       | `bg-storm.png`, `storm.png`                    |

`cards/_card.js` 는 카드 크기와 라이브러리 효과를 카드 위 자리에 찍는 `stamp`,
`cards/_bg.js` 는 배경 그리기 도구(띠 하늘·실루엣·달·별·안개)다.

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
3. 시트로 굽는다. 빛 번짐은 시트에 반투명 색으로 구워진다 — 움직이는 효과는 `light` 0.5,
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
