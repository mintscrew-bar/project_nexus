// ESLint 9 flat config — 예전 .eslintrc.js 를 그대로 옮긴 것이다.
// 규칙 구성은 바꾸지 않았다: typescript-eslint recommended + prettier(포맷 위반은 error).
// prettier 위반이 error 라서 포맷이 어긋나면 CI 가 멈춘다 — 커밋 전에 `pnpm lint` 를 돌린다.
import globals from "globals";
import tseslint from "typescript-eslint";
import prettierRecommended from "eslint-plugin-prettier/recommended";

export default tseslint.config(
  {
    // flat config 는 기본 무시 대상이 node_modules 뿐이다. 빌드 결과물과 설정 파일 자신은 직접 뺀다.
    ignores: ["dist/**", "coverage/**", "eslint.config.mjs"],
  },
  ...tseslint.configs.recommended,
  prettierRecommended,
  {
    languageOptions: {
      parserOptions: {
        project: "tsconfig.eslint.json",
        tsconfigRootDir: import.meta.dirname,
        sourceType: "module",
      },
      globals: {
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "@typescript-eslint/interface-name-prefix": "off",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
    },
  },
);
