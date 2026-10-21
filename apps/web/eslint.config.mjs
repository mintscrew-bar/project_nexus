// ESLint 9 flat config — 예전 .eslintrc.json 을 그대로 옮긴 것이다.
// eslint-config-next 15 는 아직 예전 형식(eslintrc)으로 배포돼서 FlatCompat 으로 감싼다.
// Next 16 으로 올리면 eslint-config-next 가 flat config 를 직접 내보내므로 FlatCompat 을 걷어낸다.
//
// `next lint` 는 Next 15.5 에서 deprecated, 16 에서 삭제라 package.json 의 lint 는 `eslint` 를 직접 부른다.
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });

const config = [
  {
    // `next lint` 는 .next 를 알아서 건너뛰었지만 eslint 를 직접 부르면 아니다 — 빌드 결과물을 직접 뺀다.
    ignores: [
      ".next/**",
      "node_modules/**",
      "next-env.d.ts",
      "next.config.js",
      "next.config.mjs",
      "postcss.config.js",
      "tailwind.config.js",
      "eslint.config.mjs",
    ],
  },
  ...compat.extends("next/core-web-vitals"),
];

export default config;
