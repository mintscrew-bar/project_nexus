# 서버가 혼자 꺼졌다 — 1인 운영 서비스를 죽지 않게 만들기

안녕하세요. 롤 내전 플랫폼 **NEXUS**를 개발하고 있는 하루마룬입니다.

이번 글은 기능 이야기가 아니라 **운영 이야기**입니다. 그리고 그 전에, 제가 NEXUS를 **어떤 환경에서 돌리고 있는지**부터 이야기해야 할 것 같습니다. 이번에 한 작업들이 왜 필요했는지가 거기서 나오거든요.

NEXUS는 클라우드 서버를 따로 빌려 쓰지 않습니다. **제 남는 개인 컴퓨터에 우분투(WSL2)를 올려서** 운영하고 있습니다. 사양도 서버용이 아니라 평범한 가정용 조립 PC입니다.

- **CPU** — Ryzen 7 5700X3D
- **RAM** — KLEVV DDR4 32GB (튜닝램, ECC 아님)
- **GPU** — GTX 1080

보시다시피 게임용으로 맞춘 구성이지, 24시간 서비스를 돌리라고 만든 물건이 아닙니다. 마음에 걸리는 건 **서버용 하드웨어가 주는 안전장치가 없다는 점**입니다. 가령 ECC 메모리는 값이 몰래 뒤집히는 오류(비트 플립)를 스스로 잡아주지만, 제 램은 ECC가 아닌 데다 튜닝램이라 이론적으로는 데이터가 조용히 틀어질 여지가 있습니다. Postgres를 상시 돌리는 입장에선 신경이 쓰이는 부분이죠.

또, 이 컴퓨터는 NEXUS **전용기도 아닙니다.** 제가 사무실에서 다른 작업을 같이 돌리면 CPU·메모리를 그만큼 나눠 써야 합니다. 요컨대 **"이 기계가 항상 안정적일 거라고 가정할 수 없다"**는 것 — 그래서 하드웨어를 믿는 대신, 소프트웨어로 버티는 쪽을 택했습니다.

게다가 이 컴퓨터는 **사무실에 두고 원격으로 접속해서** 씁니다. 즉 제가 집에서 자고 있는 새벽에 서버가 꺼지거나 문제가 생기면, 바로 손을 쓰기가 어렵습니다. 솔직히 집에 있더라도 매번 직접 붙어서 고치는 건 귀찮습니다. 제 성격이 그렇습니다. 그래서 저에게는 **"내가 자고 있어도, 그 자리에 없어도 알아서 버티고 되살아나는"** 구조가 어떤 기능보다도 절실했습니다.

이 한 대가 죽으면 서비스 전체가 죽습니다. 그리고 실제로, 얼마 전 이 서버가 **혼자 여러 번 껐다 켜졌습니다.**

이번 글에서는 그 사고를 계기로 "죽어도 스스로 살아나는" 구조를 어떻게 하나씩 갖춰갔는지 정리해보려고 합니다.

---

## 발단: 로그에 남은 재부팅 폭풍

어느 날 서버 상태를 확인하다 부팅 기록에서 이상한 걸 발견했습니다. 짧은 시간에 재부팅이 여러 번 찍혀 있었습니다.

```
$ last -x reboot | head
reboot   system boot   Tue 18:47   still running
reboot   system boot   Tue 18:45 - 18:46  (00:01)
reboot   system boot   Tue 18:43 - 18:45  (00:02)
reboot   system boot   Tue 18:41 - 18:43  (00:01)
...
```

커널 로그에도 WSL 부팅 자체가 꼬인 흔적이 있었습니다.

```bash
$ dmesg | grep -i wsl
WSL ERROR: CheckConnection: getaddrinfo() failed: -5
WSL ERROR: WaitForBootProcess: /sbin/init failed to start within 10000ms
```

컨테이너 로그를 보면 그 시간대에 봇이 40초 간격으로 계속 재접속하고 있었습니다 — 재부팅이 반복되던 흔적입니다.

```bash
$ docker logs nexus-api --since 72h | grep "logged in"
18:35:49  Discord bot logged in as NEXUS#0070
18:36:30  Discord bot logged in as NEXUS#0070
18:37:11  Discord bot logged in as NEXUS#0070
...
```

문제는 "왜 껐졌나"보다 **"꺼진 뒤에 서비스가 제대로 돌아왔나"** 였습니다. 확인해보니 운영 컨테이너 복구가 확실하지 않았습니다. 여기서부터 하나씩 손을 대기 시작했습니다.

---

## 1. 부팅하면 컨테이너가 알아서 돌아오게 (systemd)

Docker 컨테이너에는 `restart: unless-stopped` 정책이 걸려 있고, `docker.service`도 부팅 시 자동 시작되도록 enable돼 있습니다. 그래서 사실 **재부팅되면 Docker가 컨테이너를 알아서 되살려주긴 합니다.**

```bash
$ systemctl is-enabled docker
enabled
$ docker inspect --format '{{.Name}} {{.HostConfig.RestartPolicy.Name}}' nexus-api
/nexus-api unless-stopped
```

문제는 이 복구가 **"항상 기대대로"는 아니라는 점**입니다. 어떤 이유로 컨테이너가 삭제됐거나(예: 실패한 배포), 데몬이 깔끔하게 복원하지 못했거나, 이미지·환경이 어긋나 있으면 아무도 "원래 있어야 할 상태"를 다시 맞춰주지 않습니다.

그래서 부팅 시 스택 전체를 **의도한 상태로 한 번 더 강제 정렬**하는 systemd 유닛을 뒀습니다. 마지막으로 배포된 이미지(`IMAGE_TAG`)를 써서, pull이나 build 없이 idempotent하게 `up -d` 합니다.

```ini
# systemd/nexus.service
[Unit]
Description=Nexus Docker Compose
Requires=docker.service
After=docker.service network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/home/haru/projects/nexus
# 부팅 복구는 마지막 배포가 기록한 IMAGE_TAG의 로컬 이미지만 사용한다.
# 이미지 pull/build는 CI/CD만 담당한다.
ExecStart=/usr/bin/docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-build

# ExecStop을 두지 않는다. `docker compose down`은 컨테이너를 삭제해
# restart 정책 기반 복구를 오히려 무력화한다.

[Install]
WantedBy=multi-user.target
```

등록은 한 번만 해주면 됩니다.

```bash
sudo install -m 0644 systemd/nexus.service /etc/systemd/system/nexus.service
sudo systemctl daemon-reload
sudo systemctl enable nexus.service   # 부팅 시 자동 실행 등록

# 잘 걸렸는지 확인
systemctl is-enabled nexus.service    # → enabled
```

여기서 한 가지 실수하기 쉬운 부분이 있습니다. 습관적으로 `ExecStop`에 `docker compose down`을 넣고 싶어지는데, 그러면 종료 시 컨테이너가 삭제되어 재시작 복구가 오히려 깨집니다. 그래서 **일부러 `ExecStop`을 비워뒀습니다.**

또 하나, 부팅 복구는 반드시 **마지막으로 배포된 그 이미지**를 써야 합니다. 값이 비면 compose가 `latest`를 당기거나 로컬 빌드로 폴백해서 "배포한 것과 다른 버전"이 뜰 수 있어서, 배포 시점에 SHA를 `.env.production`에 박아둡니다.

```yaml
# .env.production 생성 (배포 워크플로우)
IMAGE_TAG=${{ github.event.workflow_run.head_sha }}
```

---

## 2. 빌드가 운영을 죽이지 않게 (빌드/런타임 분리)

사실 이 서버가 불안했던 근본 원인은 **빌드였습니다.** 예전에는 배포할 때 운영 서버 위에서 직접 Docker 이미지를 빌드했습니다. Next.js 빌드는 메모리를 1.5~2GB씩 순간적으로 잡아먹는데, swap이 부족하면 OOM Killer가 발동해 **하필 sshd나 네트워크 데몬을 죽여** 원격 복구까지 막아버립니다.

그래서 빌드를 운영 서버에서 떼어내 GitHub Actions(ubuntu-latest)로 옮기고, 운영 서버는 **완성된 이미지를 받아서 띄우기만** 하게 했습니다.

```yaml
# ci.yml — GitHub-hosted 러너에서 빌드 후 GHCR에 push
docker:
  runs-on: ubuntu-latest
  permissions:
    packages: write
  steps:
    - uses: docker/build-push-action@v7
      with:
        context: .
        file: apps/api/Dockerfile
        push: true
        tags: ghcr.io/.../api:${{ github.sha }}
        cache-from: type=gha,scope=api
        cache-to: type=gha,mode=max,scope=api
```

```yaml
# deploy.yml — 운영 서버(self-hosted)는 pull + up 만
- run: docker compose -f docker-compose.prod.yml pull
- run: docker compose -f docker-compose.prod.yml up -d
```

이 한 번의 분리로 "빌드 부하로 운영이 죽는" 구조 자체가 사라졌습니다. 운영 서버의 디스크·메모리 압박도 크게 줄었습니다.

---

## 3. 로그가 디스크를 잠식하지 않게

컨테이너 로그(json-file 드라이버)는 기본적으로 **무한히 쌓입니다.** 오래 돌수록 디스크를 조용히 갉아먹고, 디스크가 차면 그게 또 장애의 원인이 됩니다.

compose에 YAML 앵커로 전 서비스에 로그 상한을 한 번에 걸었습니다.

```yaml
# docker-compose.prod.yml
x-logging: &default-logging
  driver: json-file
  options:
    max-size: "10m"
    max-file: "3"   # 서비스당 최대 30MB

services:
  api:
    logging: *default-logging
  web:
    logging: *default-logging
  # ... 나머지 서비스도 동일 앵커 참조
```

여기에 더해, 매일 새벽 안 쓰는 이미지·빌드 캐시를 정리하는 cron도 함께 돌립니다.

```bash
# 매일 04:00
docker image prune -a -f
docker builder prune -a -f
journalctl --vacuum-time=7d
```

---

## 4. 메모리 안전망 점검과 swappiness 튜닝 (swap)

OOM을 대비하려면 swap이 있어야 합니다. 그래서 "swap을 추가하자"고 접근했는데, 확인해보니 **WSL2는 이미 swap을 제공하고 있었습니다.**

```
$ swapon --show
NAME     TYPE      SIZE USED PRIO
/dev/sdc partition   4G   0B   -2
```

그래서 새 swap 파일을 만드는 대신, `swappiness`만 조정했습니다. 기본값 60은 메모리를 너무 일찍 swap으로 내보내는데, 서버에서는 값을 낮춰 **자주 쓰는 페이지는 RAM에 두고 swap은 비상용으로만** 쓰게 하는 편이 낫습니다.

```bash
# 런타임 즉시 적용
sudo sysctl -w vm.swappiness=10

# 영구 적용 (부팅 시 systemd-sysctl가 /etc/sysctl.d/ 를 로드)
echo 'vm.swappiness = 10' | sudo tee /etc/sysctl.d/99-nexus-swap.conf

# 확인
cat /proc/sys/vm/swappiness   # → 10
```

환경을 "고치기 전에 먼저 들여다본다"는 게 이번에 얻은 교훈입니다. 없는 줄 알았던 swap이 이미 있었고, 덕분에 불필요한 파일 생성과 재시작을 피했습니다.

정리하면, OOM으로부터 서비스를 지켜주는 **진짜 안전망은 이미 있던 이 swap**이고, 여기에 앞서 (2번에서) 빌드를 서버 밖으로 빼내 큰 메모리 스파이크 자체를 없앤 것이 더 크게 작용합니다. swappiness 조정은 그 위에서 평상시 동작을 다듬는 정도의 마무리입니다.

---

## 5. 떠 있는데 응답만 안 하는 상태까지 복구 (autoheal)

`restart: unless-stopped`가 못 잡는 케이스가 있습니다. **프로세스는 살아있는데 응답만 안 하는 상태** — 즉 healthy에서 unhealthy로 떨어진 컨테이너입니다. Docker는 이걸 자동으로 재시작해주지 않습니다.

그래서 정작 장애가 났던 web/nginx에 healthcheck를 붙이고, autoheal 컨테이너로 unhealthy를 감시해 자동 재시작하게 했습니다.

```yaml
# nginx: upstream과 무관하게 nginx 자체 생존만 확인
nginx:
  healthcheck:
    test: ["CMD-SHELL", "wget -q -O /dev/null http://127.0.0.1/healthz || exit 1"]
    interval: 20s
  labels:
    - autoheal=true

# unhealthy = true 라벨 컨테이너를 감시해 자동 재시작
autoheal:
  image: willfarrell/autoheal:latest
  environment:
    AUTOHEAL_CONTAINER_LABEL: autoheal
    AUTOHEAL_INTERVAL: 10
  volumes:
    - /var/run/docker.sock:/var/run/docker.sock
```

nginx 쪽은 upstream(web/api) 상태에 휘둘리지 않도록, nginx 프로세스 생존만 확인하는 가벼운 엔드포인트를 따로 뒀습니다.

```nginx
location = /healthz {
  access_log off;
  return 200 "ok";
}
```

적용 후에는 각 컨테이너에 healthcheck가 실제로 걸렸는지, 상태가 `healthy`인지 확인합니다.

```bash
# 서비스별 healthcheck 유무
$ docker inspect --format '{{.Name}} {{if .Config.Healthcheck}}O{{else}}X{{end}}' \
    nexus-web nexus-nginx nexus-api
/nexus-web O
/nexus-nginx O
/nexus-api O

# 현재 상태 (starting → healthy)
$ docker ps --format '{{.Names}}\t{{.Status}}'
nexus-web     Up 3 minutes (healthy)
nexus-nginx   Up 3 minutes (healthy)

# autoheal이 무슨 일을 했는지
$ docker logs nexus-autoheal --tail 5
```

autoheal은 컨테이너를 재시작하기 위해 `docker.sock`을 마운트합니다. 이건 사실상 호스트 Docker 제어 권한이라 가볍게 볼 건 아니지만, "혼자 운영하는 서버가 새벽에 조용히 죽어 있는" 상황을 막는 대가로는 받아들일 만한 트레이드오프라고 판단했습니다.

---

## 6. 무엇보다, 죽었다는 걸 바로 알게

이전에는 배포가 실패해도 아무 알림이 없어서, **사용자가 "사이트가 안 열려요"라고 제보해야** 알았습니다. 가장 급소였습니다.

CI/CD 실패 시 Discord로 알림을 보내게 했습니다. 여기서 중요한 설계 포인트 하나 — **알림 job은 운영 서버(self-hosted)가 아니라 GitHub-hosted 러너에서 돌려야 합니다.** 배포가 실패하는 이유가 "운영 서버가 죽어서"인 경우, 알림까지 그 서버에 두면 같이 죽어서 무의미하니까요.

```yaml
# deploy.yml — 배포 실패 알림은 ubuntu-latest에서
notify-failure:
  needs: deploy
  if: ${{ failure() }}
  runs-on: ubuntu-latest   # ← self-hosted가 죽어도 이건 살아있음
  steps:
    - env:
        WEBHOOK: ${{ secrets.DEPLOY_ALERT_DISCORD_WEBHOOK }}
      run: |
        [ -z "$WEBHOOK" ] && exit 0   # 시크릿 없으면 조용히 스킵
        curl -fsS -X POST -H "Content-Type: application/json" \
          -d "$(jq -n --arg c "🚨 배포 실패" '{content:$c}')" "$WEBHOOK"
```

---

## 정리하며

이번 작업으로 얻은 방어선을 정리하면 이렇습니다.

| 상황 | 대응 |
|------|------|
| 서버 재부팅 | systemd가 마지막 배포 이미지로 스택 복구 |
| 빌드 부하 | 빌드를 GitHub Actions로 분리, 운영은 pull만 |
| 디스크 잠식 | 로그 상한 + 매일 정리 cron |
| 메모리 부족 | swap + swappiness 조정 |
| 응답 불능 컨테이너 | healthcheck + autoheal 자동 재시작 |
| 장애 인지 | CI/CD 실패 시 Discord 알림 (외부 러너) |

전부 화려한 기능은 아니지만, 1인 운영에서는 **"내가 자고 있어도 서비스가 스스로 버티는가"** 가 기능만큼 중요합니다.

다음 글에서는, 이 작업들을 배포하면서 신경 쓰기 싫었던 잡일 하나 — **버전 관리** — 를 아예 자동화한 이야기를 풀어보겠습니다.
