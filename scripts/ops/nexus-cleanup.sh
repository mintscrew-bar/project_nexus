#!/usr/bin/env bash
#
# 디스크 자동 정리 (TODO_server_reliability Task 1)
#
# 2026-05-09 사고: 빌드마다 쌓인 도커 이미지 레이어로 디스크가 차서
# `mkdir ... input/output error` → web/nginx 다운 → SSH까지 거부.
#
# 빌드는 이제 GitHub runner에서 하지만(Task 5), pull한 옛 SHA 이미지와
# 컨테이너 로그·journald는 여전히 이 호스트에 쌓인다. 배포가 한동안 없으면
# CD의 정리 단계도 돌지 않으므로 매일 한 번 독립적으로 청소한다.
#
# 설치:
#   sudo install -m 0755 scripts/ops/nexus-cleanup.sh /usr/local/bin/nexus-cleanup
#   sudo ln -sf /usr/local/bin/nexus-cleanup /etc/cron.daily/nexus-cleanup
#
# 수동 실행: sudo nexus-cleanup
set -euo pipefail

log() { echo "[nexus-cleanup] $*"; }

log "=== 정리 전 ==="
df -h / || true
docker system df || true

# 실행 중인 컨테이너가 참조하는 이미지는 Docker가 자동으로 보호한다.
# until 필터로 최근 24시간 내 이미지는 남겨 롤백 여지를 지운다.
log "도커 이미지/컨테이너/네트워크 정리 (24시간 이전)"
docker system prune -af --filter "until=24h" || log "docker prune 실패(무시)"

# 운영 호스트에서는 빌드하지 않지만, 과거 잔재나 오염된 캐시가 남을 수 있다.
log "BuildKit 캐시 정리"
docker builder prune -af || log "builder prune 실패(무시)"

# 컨테이너 로그는 compose의 max-size로 묶여 있고, 여기서는 호스트 journald를 줄인다.
log "journald 7일치만 유지"
journalctl --vacuum-time=7d || log "journal vacuum 실패(무시)"

log "=== 정리 후 ==="
df -h / || true
docker system df || true
