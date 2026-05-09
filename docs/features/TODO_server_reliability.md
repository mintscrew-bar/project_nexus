# 서버 안정성 / 자동 복구 TODO

> 작성일: 2026-05-09
> 트리거: 디스크 I/O 에러로 nexus-web/nginx 다운 + Tailscale 응답 불가 + SSH 거부 → 원격 복구 불가능 사고
> 목표: 같은 사고 재발 방지, 사고 발생 시 원격 복구 경로 확보

---

## 즉시 (사고 직후 우선순위, 작업량 작음)

- [ ] Task 1: 디스크 자동 정리 cron
  - 매일 새벽 안 쓰는 도커 이미지/컨테이너/네트워크/빌드캐시 prune
  - `docker system prune -af --filter "until=24h"` + `journalctl --vacuum-time=7d`
  - **위치**: 서버 systemd timer 또는 cron (`/etc/cron.daily/nexus-cleanup`)
  - **효과**: 빌드마다 누적되는 dangling 이미지로 디스크가 차서 발생한 오늘 사고 재발 방지

- [ ] Task 2: Docker 로그 size 제한
  - 컨테이너 로그가 무한 누적되어 디스크를 잠식하는 문제 차단
  - `docker-compose.prod.yml` 각 서비스에 `logging.options.max-size: "10m"`, `max-file: "3"` 추가
  - **효과**: 컨테이너당 로그를 30MB로 제한, 디스크 보호

- [ ] Task 3: 디스크 사용량 알림
  - Uptime Kuma에 디스크 사용률 모니터링 추가 또는 별도 cron으로 80% 초과 시 Discord 웹훅 알림
  - **위치**: `~/scripts/disk-alert.sh` + cron, 또는 Uptime Kuma push monitor
  - **효과**: 사후 복구가 아니라 사전 경고로 전환

- [ ] Task 4: swap 파일 추가
  - 메모리 부족 시 OOM-killer가 nginx/sshd/Tailscale 같은 핵심 서비스를 죽이는 위험 완화
  - 4~8GB swap 파일 + `swappiness=10`
  - **위치**: 서버 `/swapfile` + `/etc/fstab`
  - **효과**: 빌드 시점 메모리 스파이크에도 OOM 회피, sshd 살아있게 유지

---

## 핵심 인프라 (중간 작업량)

- [ ] Task 5: 빌드를 GitHub-hosted runner로 이전
  - 현재 self-hosted runner가 서버 본체에서 빌드 → 메모리/디스크 압박 + 빌드 실패 = 서버 셧다운
  - 빌드는 GitHub Actions ubuntu-latest 에서 → ghcr.io 푸시 → self-hosted runner는 `docker pull && docker compose up -d` 만
  - **위치**: `.github/workflows/ci.yml`, `deploy.yml`, `docker-compose.prod.yml` (이미지 참조)
  - **효과**: 서버는 빌드 부하 0, 디스크 사용량 안정, 운영 영향 거의 없음

- [ ] Task 6: tailscaled 자동 재시작
  - Tailscale 데몬이 행 걸리면 SSH 못 함 = 원격 복구 채널 단절
  - systemd unit 에 `Restart=always`, `RestartSec=5s` 보장 (이미 기본값일 가능성 있음 — 확인 필요)
  - watchdog 스크립트: 1분마다 `tailscale status` 검사, 실패 시 데몬 재시작
  - **효과**: SSH 채널 자가 복구

- [ ] Task 7: 컨테이너 자가 복구 강화
  - `restart: unless-stopped` 만으로는 healthcheck 실패 시 자동 재시작 안 됨
  - autoheal 컨테이너 추가 또는 healthcheck failure 핸들러 작성
  - **위치**: `docker-compose.prod.yml`
  - **효과**: nexus-web/nginx unhealthy 시 자동 재시작

- [ ] Task 8: 빌드 스토리지 압축 정책
  - BuildKit 캐시가 무제한 누적 → 빌드 한 번에 수 GB 추가
  - `buildkitd.toml` 또는 빌드 옵션으로 `gc.maxStorage: 10GB` 설정
  - **효과**: 빌드 캐시 자동 GC, 디스크 잠식 방지

---

## 원격 복구 채널 (중요도 높음)

- [ ] Task 9: Cloudflare Tunnel SSH 라우트 추가
  - Tailscale 끊겨도 Cloudflare Zero Trust 통해 SSH 가능하게
  - `cloudflared` 설정에 `ssh.labs-nexus.com` → `ssh://localhost:22` 추가
  - 클라이언트는 `cloudflared access ssh --hostname ssh.labs-nexus.com`
  - **효과**: Tailscale 장애 = 즉시 차단 → 백업 채널 확보

- [ ] Task 10: Wake-on-LAN 설정
  - PC가 행 걸려서 SSH/Tailscale 둘 다 죽으면 강제 재부팅 필요
  - BIOS WOL 활성화 + 공유기에서 magic packet 송신 가능 환경 구축
  - 가능하면 같은 LAN의 라즈베리파이 등에 WOL 보내는 스크립트 두기
  - **효과**: 물리 PC 앞에 안 가도 강제 재부팅 가능

- [ ] Task 11: Discord 봇 ops 명령
  - `nexus-api` 컨테이너에 docker.sock 마운트 + 관리자 전용 슬래시 명령
  - `/ops restart web`, `/ops restart nginx`, `/ops disk`, `/ops logs <service>` 등
  - 보안: 특정 Discord user ID 화이트리스트, 명령 화이트리스트 (rm/exec 금지)
  - **효과**: SSH 끊겨도 Discord로 컨테이너 재시작 가능 (오늘처럼 봇만 살아있을 때 결정적)

---

## 모니터링 / 가시성

- [ ] Task 12: Uptime Kuma 알림 채널 연결
  - 컨테이너는 떠 있지만 알림 발송 채널(Discord 웹훅/이메일)이 연결돼 있는지 확인
  - 사이트 다운 시 즉시 푸시 알림 받도록
  - **효과**: 오늘처럼 사용자 보고 후에야 알게 되는 상황 방지

- [ ] Task 13: deploy 워크플로우 실패 알림
  - 현재 GitHub Actions 빌드 실패가 Discord/이메일로 안 와서 사용자가 사이트 502 보고 알아챔
  - workflow 끝에 conclusion=failure 시 webhook 호출 step 추가
  - **효과**: 배포 실패 즉시 인지

- [ ] Task 14: 핵심 메트릭 노출
  - 디스크 사용률, 메모리, 컨테이너 healthcheck 상태를 한눈에 볼 대시보드
  - Uptime Kuma 보강 또는 Grafana + node_exporter 추가 검토
  - **효과**: 사고 전조 감지

---

## 정책 / 프로세스

- [ ] Task 15: 배포 전 리소스 체크 게이트
  - deploy.yml 에 빌드 직전 `df -h`, `free -h` 검사 → 임계치 미만이면 abort
  - **효과**: 디스크/메모리 부족 상태에서 배포 진입 자체 차단

- [ ] Task 16: 운영 런북 (recovery playbook) 정리
  - "사이트 502 시 1분 안에 할 일", "SSH 안 될 때 복구 순서", "디스크 풀 시 정리 명령"
  - **위치**: `docs/setup/RECOVERY_PLAYBOOK.md`
  - **효과**: 사건 시 우왕좌왕 방지, 다른 사람도 복구 가능

---

## 오늘 사고 회고 (참고)

발생: 2026-05-09 오전, push 후 self-hosted runner 가 web 빌드 진행 중 디스크 I/O 에러 (`mkdir ... input/output error`) → web/nginx 다운 → 사이트 502.
복구 차단 요인:
- Tailscale 응답 없음 → SSH 불가
- docker.sock 봇에 미마운트 → Discord 통한 복구 불가
- self-hosted runner 도 같은 서버에서 죽음 → workflow 발동 불가
- cloudflared 만 살아있어 502 응답만 가능

→ 위 Task 5(빌드 분리), Task 9(Tunnel SSH), Task 11(봇 ops) 셋 중 하나만 미리 있었어도 즉시 복구 가능했음.
