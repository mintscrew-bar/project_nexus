#!/bin/sh
set -e

# 컨테이너 시작 시 하는 일을 세 가지로 분리한다.
#
# 이전에는 CMD 한 줄에 migrate + 백필 2종 + pm2-runtime이 &&로 묶여 있었다.
# 그래서 (1) 재시작할 때마다 riotAccount 전체 배치 스캔 비용을 냈고,
# (2) 백필 하나가 실패하면 애플리케이션이 아예 뜨지 못했다.
# 마이그레이션은 스키마 정합성에 필수라 시작 경로에 남기고,
# 일회성 데이터 작업만 별도 명령으로 뺀다.
#
# 사용:
#   serve     (기본) 마이그레이션 적용 후 API 기동
#   migrate   마이그레이션만 적용
#   backfill  데이터 백필만 실행 후 종료
#   그 외     인자를 그대로 실행
#
# 백필 일회성 실행:
#   docker compose -f docker-compose.prod.yml run --rm api backfill
#
# 주의: backfill-balance-scores는 BALANCE_SCORE_VERSION이 올라가면
# 기존 점수를 재계산하는 역할도 한다. 산식 버전을 바꾼 배포에서는
# 위 명령을 한 번 실행해야 한다.

SCHEMA=/app/prisma/schema.prisma

run_migrations() {
  echo "[entrypoint] 마이그레이션 적용"
  # 운영에서는 스키마 강제 동기화(db push)를 쓰지 않고 검증된 마이그레이션만 적용한다.
  node_modules/.bin/prisma migrate deploy --schema="$SCHEMA"
}

run_backfills() {
  echo "[entrypoint] 데이터 백필 실행"
  node dist/scripts/backfill-encrypted-emails.js
  node dist/scripts/backfill-balance-scores.js
}

case "${1:-serve}" in
  serve)
    run_migrations
    echo "[entrypoint] API 기동"
    exec pm2-runtime ecosystem.config.js
    ;;
  migrate)
    run_migrations
    ;;
  backfill)
    run_backfills
    ;;
  *)
    exec "$@"
    ;;
esac
