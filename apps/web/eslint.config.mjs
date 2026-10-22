// ESLint 9 flat config.
// eslint-config-next 16 부터 flat config 를 직접 내보내서 FlatCompat 없이 그대로 쓴다.
//
// `next lint` 는 Next 16 에서 삭제됐다 — package.json 의 lint 는 `eslint src` 를 직접 부른다.
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const config = [
  {
    // 빌드 결과물과 설정 파일은 검사하지 않는다 (`next lint` 가 알아서 건너뛰던 것들)
    ignores: [
      ".next/**",
      ".next-*/**",
      "node_modules/**",
      "next-env.d.ts",
      "next.config.js",
      "next.config.mjs",
      "postcss.config.js",
      "tailwind.config.js",
      "eslint.config.mjs",
    ],
  },
  ...nextCoreWebVitals,
  {
    // eslint-config-next 16 이 React Compiler 용 react-hooks 규칙을 error 로 켠다.
    // 업그레이드 시점(2026-10-22) 기존 코드에서 159건이 걸렸다(대부분 set-state-in-effect).
    // 웹 테스트가 없어서 effect 로직을 한꺼번에 고치는 건 회귀 위험이 커, 일단 경고로 낮춰
    // 보이게만 두고 실제 수정은 파일 단위로 나눠서 한다. 다 고치면 이 블록을 지운다.
    rules: {
      "react-hooks/config": "warn",
      "react-hooks/error-boundaries": "warn",
      "react-hooks/gating": "warn",
      "react-hooks/globals": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/set-state-in-render": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
];

export default config;
