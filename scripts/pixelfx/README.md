# pixelfx 원본 효과

꾸미기 그림 중 pixelfx(https://github.com/patch-gg/pixelfx, MIT)로 그려 스프라이트 시트로 구운 것의 원본 효과 파일.
사이트는 구운 PNG만 쓰고, 이 파일들은 다시 고쳐 굽고 싶을 때만 쓴다.

| 파일            | 쓰는 곳                                                  | 구운 시트                                                                         |
| --------------- | -------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `card-blaze.js` | 카드 장식 「픽셀 화염」(`FX_FIRE`, effects.tsx `FireFx`) | `apps/web/public/cosmetics/cards/fire-blaze.png` — 88×74 칸 60장, 가로 8칸, 20fps |

## 다시 굽기

1. pixelfx 를 받아 효과 파일을 `src/fx/fire/` 에 넣는다.
   ```bash
   git clone https://github.com/patch-gg/pixelfx && cp scripts/pixelfx/card-blaze.js pixelfx/src/fx/fire/
   ```
2. 그려 보고(`records/fire/card-blaze/contact.png`) 고친다.
   ```bash
   cd pixelfx && node tools/render.mjs fire/card-blaze
   ```
3. 시트로 굽는다. 빛 번짐은 시트에 반투명 색으로 구워지므로 약하게(`light` 0.35) 굽는다 —
   세게 구우면 카드 아래 이름 가림막과 겹쳐 밑동이 회색으로 탁해진다.
   ```bash
   node tools/render.mjs fire/card-blaze --sheet --opts '{"light":0.35}'
   cp records/fire/card-blaze/card-blaze.png ../apps/web/public/cosmetics/cards/fire-blaze.png
   ```
4. 칸 크기·장수·가로 칸 수·fps 가 바뀌었으면 `FireFx` 의 `PixelSheet` 값도 맞춘다
   (`records/fire/card-blaze/card-blaze.json` 의 `meta.pixelfx`).

`node tools/check.mjs fire/card-blaze` 는 「캔버스 밖에 그림」 경고를 낸다 — 양옆 불 혀가 카드 가장자리에서
잘려 불벽이 이어져 보이게 일부러 넘긴 것이라 그대로 둔다.
