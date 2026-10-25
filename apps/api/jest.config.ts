import type { Config } from "jest";

const config: Config = {
  moduleFileExtensions: ["js", "json", "ts"],
  rootDir: "src",
  testRegex: ".*\\.spec\\.ts$",
  transform: {
    "^.+\\.(t|j)s$": "ts-jest",
  },
  collectCoverageFrom: ["**/*.(t|j)s"],
  coverageDirectory: "../coverage",
  testEnvironment: "node",
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/$1",
    // 빌드된 dist 를 쓴다. Prisma 7 클라이언트는 TypeScript 소스(8MB)로 생성돼서 src 를 물리면
    // ts-jest 가 워커마다 그걸 타입 검사·컴파일해 테스트가 10분을 넘긴다(전엔 36초).
    // turbo 의 test 가 ^build 에 의존하므로 `pnpm test` 는 먼저 database 를 빌드한다.
    "^@nexus/database$": "<rootDir>/../../../packages/database/dist",
  },
};

export default config;
