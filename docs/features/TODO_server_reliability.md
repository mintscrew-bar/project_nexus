# 서버 안정성 / 자동 복구 TODO

> 작성일: 2026-05-09
> 트리거: 디스크 I/O 에러로 nexus-web/nginx 다운 + Tailscale 응답 불가 + SSH 거부 → 원격 복구 불가능 사고
> 목표: 같은 사고 재발 방지, 사고 발생 시 원격 복구 경로 확보
>
> **호스트 실측(2026-09-03):** 코드로 들어간 것과 호스트에 실제로 설치된 것이 다르다.
> 아래 각 항목의 "설치 필요" 표기는 이 날짜 기준으로 재확인한 것이다.
> 현재 디스크는 39G/1007G(5%)로 여유가 있어 급한 불은 없다.

---

## 즉시 (사고 직후 우선순위, 작업량 작음)

- [x] Task 1: 디스크 자동 정리 cron — `scripts/ops/nexus-cleanup.sh` (2026-09-03 완료)
      갈라져 있던 두 스크립트를 하나로 합쳤다. 구버전 `scripts/disk-cleanup.sh` 는 삭제하고
      그 고유 기능(npm/pnpm/apt 캐시 정리, before/after 디스크 Discord 보고)을 흡수했다.
      `until=24h` 필터(롤백용 직전 이미지 보존)는 유지.
      **설치 방식 변경**: 이 호스트에 passwordless sudo 가 없어 `/etc/cron.daily` 설치가
      불가능했다. `scripts/ops/install-cron.sh` 로 유저 crontab 에 등록한다(매일 04:00).
      웹훅은 crontab 평문에서 `~/.config/nexus-ops.env`(0600)로 옮겼다.

- [x] Task 2: Docker 로그 size 제한 — `x-logging` 앵커로 7개 서비스 전부 적용 (10m × 3)
  - 컨테이너 로그가 무한 누적되어 디스크를 잠식하는 문제 차단
  - `docker-compose.prod.yml` 각 서비스에 `logging.options.max-size: "10m"`, `max-file: "3"` 추가
  - **효과**: 컨테이너당 로그를 30MB로 제한, 디스크 보호

- [x] Task 3: 디스크 사용량 알림 — `scripts/ops/disk-alert.sh` (2026-09-03 설치 완료)
      30분마다 검사, 80% 초과 시 Discord, 하루 1회 쿨다운. `install-cron.sh` 가 함께 등록한다.
      상태 파일과 웹훅을 `/etc/` → 유저 홈으로 옮겨 sudo 없이 돌게 했다.
      임계치 오버라이드(`DISK_ALERT_THRESHOLD=1 ./disk-alert.sh`)로 전송 경로까지 실검증했다.

- [x] ~~Task 4: swap 파일 추가~~ — **불필요로 종결 (2026-09-03 실측)**
      원래 목적은 "빌드 메모리 스파이크로 OOM-killer 가 sshd/tailscaled 를 죽이는 것" 방지였는데,
      Task 5 로 빌드가 GitHub runner 로 빠지면서 그 스파이크 자체가 사라졌다.
      현재 호스트: 총 11Gi 중 사용 1.5Gi / available 10Gi, 컨테이너 7개 합계 약 440MB,
      OOM 이력 0건. 지금 잡힌 WSL 기본 스왑 2G 로 충분하다.
      메모리를 크게 먹는 작업을 호스트에서 다시 돌리게 되면 그때
      `sudo bash scripts/ops/setup-swap.sh` 한 줄로 되살린다. 스크립트는 남겨 둔다.

## 핵심 인프라 (중간 작업량)

- [x] Task 5: 빌드를 GitHub-hosted runner로 이전 ★ **구조적 원인** — 최우선
      이미 완료돼 있었다(체크박스만 낡음). `ci.yml`의 `docker` 잡이 ubuntu-latest에서
      빌드해 GHCR에 푸시하고, `deploy.yml`은 pull + 단계별 롤아웃만 한다.
  - **현재 구조의 문제**:
    - `deploy.yml` 이 self-hosted (= 운영 서버) 위에서 `docker compose build` 실행
    - 매 빌드마다 nexus-api(~1.5GB) + nexus-web(~1GB) 이미지 layer 가 `/var/lib/containerd/...` 누적
    - 기존 `docker image prune -f` 는 dangling layer 만 정리 → 옛 tagged 이미지 잔재는 안 지움 → 디스크 무한 누적
    - Next.js 빌드는 메모리 1.5~2GB 스파이크 → swap 없으면 OOM-killer 발동 → sshd/tailscaled 사망 → 원격 복구 차단
    - 빌드와 운영 컨테이너가 같은 disk/RAM 공유 → 빌드가 운영 죽임
    - 2026-05-09 사고 = 디스크 I/O 에러(`mkdir ... input/output error`) → web/nginx 다운 → SSH 거부 → 원격 복구 불가 = 이 구조의 직접적 결과
  - **변경 후 구조**:
    ```
    GitHub push
        ↓
    ci.yml (ubuntu-latest):  lint + test + Docker 이미지 빌드 + GHCR push
        ↓
    deploy.yml (self-hosted): docker compose pull + up -d 만
    ```
  - **변경 파일**:
    1. `.github/workflows/ci.yml` — Docker buildx + GHCR 푸시 추가, `permissions: { packages: write }` 부여
    2. `.github/workflows/deploy.yml` — `build` step 제거, `docker compose pull && up -d` 만
    3. `docker-compose.prod.yml` — api/web 서비스에 `image: ghcr.io/mintscrew-bar/project_nexus/{api,web}:latest` 추가 (build 는 로컬 dev 폴백으로 유지)
    4. (선택) `.github/workflows/ci.yml` 의 `docker/login-action@v3` + `docker/build-push-action@v5` 사용
  - **효과**:
    - 운영 서버 빌드 부하 0 (디스크/메모리 모두)
    - 빌드 실패해도 운영 영향 0
    - 디스크 누적 사라짐 (이미지는 GHCR 측에서 관리)
    - GitHub-hosted runner 무료 (public repo 무제한, private 도 월 2,000분)
    - GHCR 무료 (public package 무제한)
  - **예상 작업 시간**: 30~60분 (워크플로우 작성 + GHCR 권한 + docker-compose 수정 + 첫 배포 검증)

- [ ] Task 6: tailscaled 자동 재시작
  - Tailscale 데몬이 행 걸리면 SSH 못 함 = 원격 복구 채널 단절
  - 확인 결과(2026-09-03): `Restart=on-failure`, `RestartUSec=100ms`.
    프로세스가 죽으면 살아나지만 **응답 없이 매달린 경우는 감지하지 못한다** → watchdog 은 여전히 필요
  - watchdog 스크립트: 1분마다 `tailscale status` 검사, 실패 시 데몬 재시작
  - **효과**: SSH 채널 자가 복구

- [ ] Task 7: 컨테이너 자가 복구 강화
  - 확인 결과(2026-09-03): healthcheck 는 postgres·redis·api·web·nginx 5개에 정의돼 있는데
    autoheal 컨테이너가 없어 **unhealthy 를 보고 재시작해 줄 주체가 없다**
  - `restart: unless-stopped` 만으로는 healthcheck 실패 시 자동 재시작 안 됨
  - autoheal 컨테이너 추가 또는 healthcheck failure 핸들러 작성
  - **위치**: `docker-compose.prod.yml`
  - **효과**: nexus-web/nginx unhealthy 시 자동 재시작

- [x] Task 8: 빌드 스토리지 압축 정책 — Task 5로 해소됨.
      운영 호스트는 더 이상 빌드하지 않고, CI는 GitHub Actions 캐시(저장소당 10GB LRU 자동 관리)를 쓴다.
      잔재 방지용 `builder prune`은 CD와 일일 정리 스크립트 양쪽에 있다.
  - BuildKit 캐시가 무제한 누적 → 빌드 한 번에 수 GB 추가
  - `buildkitd.toml` 또는 빌드 옵션으로 `gc.maxStorage: 10GB` 설정
  - **효과**: 빌드 캐시 자동 GC, 디스크 잠식 방지

---

## 원격 복구 채널 (중요도 높음)

- [ ] Task 9: Cloudflare Tunnel SSH 라우트 추가 — **저장소 밖 작업**
  - `cloudflared` 가 `TUNNEL_TOKEN` 기반 원격 관리형이라 compose 파일이 아니라
    Cloudflare Zero Trust 대시보드에서 Public Hostname 을 추가해야 한다 (2026-09-03 확인)
  - 참고: Tailscale 은 현재 정상 동작 중(이 호스트 = `oldfriend`)이라 당장 단절 상태는 아니다
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

- [x] Task 12: Uptime Kuma 알림 채널 연결 — **이미 되어 있었다 (2026-09-03 확인)**
      Kuma DB 를 직접 조회한 결과 Discord 알림(`notification` id=1, active)이
      모니터 6개 전부(`Nexus Public`, `Nexus API Public`, `Nexus API Internal`,
      `Nginx`, `PostgreSQL`, `Redis`)에 연결돼 있다.

- [x] Task 13: deploy 워크플로우 실패 알림 — CI(이미지 빌드)·CD(배포) 양쪽에 추가
      (`ci.yml:151`, `deploy.yml:225`). `DEPLOY_ALERT_DISCORD_WEBHOOK` 시크릿 미설정이면
      조용히 건너뛴다. **시크릿 등록 여부는 저장소 밖이라 코드로 확인 불가** — GitHub Settings 에서 확인할 것.
  - 현재 GitHub Actions 빌드 실패가 Discord/이메일로 안 와서 사용자가 사이트 502 보고 알아챔
  - workflow 끝에 conclusion=failure 시 webhook 호출 step 추가
  - **효과**: 배포 실패 즉시 인지

- [x] Task 14: 핵심 메트릭 노출 — **별도 스택 없이 종결 (2026-09-03)**
      원래 Grafana + node_exporter 를 검토했지만, 실제로 필요한 세 가지가 이미 커버된다.
      - 컨테이너 healthcheck 상태 → Uptime Kuma 모니터 6개 (Task 12)
      - 디스크 사용률 → `disk-alert.sh` 30분 주기 임계 알림 (Task 3)
      - 메모리 → 현재 여유 10Gi, 빌드가 호스트를 떠나 스파이크 요인이 없음 (Task 4 참고)
      운영자 1인·컨테이너 7개 규모에 Grafana 를 얹으면 그 자체가 또 하나의 관리 대상이 된다.
      필요해지는 시점은 "왜 느린지"를 사후에 봐야 할 때이고, 그때 다시 연다.

## 정책 / 프로세스

- [x] Task 15: 배포 전 리소스 체크 게이트 — 이미 완료돼 있었다.
      `deploy.yml`의 「디스크 여유 체크」가 90% 초과 시 배포를 중단하고 정리 명령을 안내한다.
  - deploy.yml 에 빌드 직전 `df -h`, `free -h` 검사 → 임계치 미만이면 abort
  - **효과**: 디스크/메모리 부족 상태에서 배포 진입 자체 차단

- [x] Task 16: 운영 런북 — `docs/setup/RECOVERY_PLAYBOOK.md`
      502·디스크·메모리·롤백·SSH 불가·재부팅·스키마까지 사고 중에 순서대로 읽는 명령 모음.
      구조 설명은 기존 `OPERATIONS_RECOVERY.md`에 두고 런북에는 명령만 남겼다.
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
