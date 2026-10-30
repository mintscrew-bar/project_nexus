# 결과창 캡처 인식 실험 (Ollama)

토너먼트 코드 없이 연 내전은 Riot 이 개인 기록(챔피언·KDA·CS·골드)을 주지 않는다.
게임 종료 후 **결과창 캡처를 로컬 비전 모델로 읽어** 이 빈칸을 채울 수 있는지 재 보는 실험이다.

- 화면: 관리자 → 롤 → 시스템 → **캡처 인식 실험** (ADMIN 전용)
- 결과는 저장하지 않는다. 캡처도 메모리에서만 쓰고 버린다.
- 외부 API 를 쓰지 않는다. 운영 호스트의 GPU 에서 Ollama 가 돈다.

## 구조

```
브라우저 ──(캡처 업로드)──▶ api 컨테이너 ──▶ host.docker.internal:11434 (호스트 Ollama, GPU)
    ◀──(작업 ID)──             │
    ──(2초마다 결과 폴링)──▶   └ 결과는 메모리에 최근 20건만
```

분석이 수십 초 걸리는데 Cloudflare 는 응답을 100초까지만 기다린다(524).
그래서 업로드 요청은 작업 ID 만 바로 돌려주고, 화면이 `GET /admin/capture-ocr/jobs/:id` 로 폴링한다.
GPU 는 한 번에 한 장만 처리한다 — 분석 중에 또 올리면 409.

## 호스트 준비 (네이티브 리눅스 기준)

### 1. NVIDIA 드라이버

GTX 1080(Pascal, compute 6.1)은 **드라이버 580 번대가 마지막 지원**이다. 그보다 새 브랜치를 깔면 안 된다.
Ollama 는 이 세대에 드라이버 570 이상을 요구한다.

```bash
nvidia-smi   # 드라이버 버전과 VRAM 8GB 가 보이면 된다
```

### 2. Ollama — 버전 고정

CUDA 13 은 Pascal 을 지원하지 않는다. Ollama 는 아직 CUDA 12 빌드를 같이 내지만
언제 빠질지 모르므로 **검증한 버전으로 고정하고 함부로 올리지 않는다.**

```bash
curl -fsSL https://ollama.com/install.sh | OLLAMA_VERSION=0.40.5 sh
```

### 3. 컨테이너에서 접근 가능하게

기본값(127.0.0.1)은 컨테이너에서 닿지 않는다. 도커 기본 브리지 주소(`172.17.0.1`)에만 연다.
`0.0.0.0` 으로 열면 집 공유기 안의 다른 기기에도 열리니 피한다.

```bash
sudo systemctl edit ollama
```

```ini
[Unit]
# docker0(172.17.0.1)이 생긴 뒤에 떠야 그 주소로 바인딩된다
After=docker.service
Requires=docker.service

[Service]
Environment="OLLAMA_HOST=172.17.0.1:11434"
# GPU 는 한 장씩 — 동시에 돌리면 VRAM 8GB 를 넘는다
Environment="OLLAMA_NUM_PARALLEL=1"
Environment="OLLAMA_MAX_LOADED_MODELS=1"
# 5분 동안 안 쓰면 VRAM 에서 내린다
Environment="OLLAMA_KEEP_ALIVE=5m"
```

```bash
sudo systemctl restart ollama
OLLAMA_HOST=172.17.0.1:11434 ollama pull qwen2.5vl:7b
OLLAMA_HOST=172.17.0.1:11434 ollama pull qwen3-vl:8b   # 비교용 (선택)
OLLAMA_HOST=172.17.0.1:11434 ollama pull qwen3-vl:4b   # 비교용 (선택)
```

### 4. GitHub Secret

| Secret              | 값                                   |
| ------------------- | ------------------------------------ |
| `OLLAMA_BASE_URL`   | `http://host.docker.internal:11434`  |
| `CAPTURE_OCR_MODEL` | `qwen2.5vl:7b` (비우면 이 값이 기본) |

`OLLAMA_BASE_URL` 이 비어 있으면 탭에 "연결 안 됨"만 뜨고 나머지 기능에는 영향이 없다.
api 서비스의 `extra_hosts: host.docker.internal:host-gateway` 가 이 이름을 호스트로 연결한다.

### 확인

```bash
docker exec nexus-api wget -qO- http://host.docker.internal:11434/api/version
```

## 실측 (2026-10-30, GTX 1080 · WSL, 1280×720 가짜 점수판 · 정답 82칸)

| 모델           | 정답    | 소요(첫 호출, 모델 적재 포함) | 비고                                             |
| -------------- | ------- | ----------------------------- | ------------------------------------------------ |
| `qwen2.5vl:7b` | 82 / 82 | 47초 (이미지 5초 + 생성 25초) | **기본값으로 채택**                              |
| `qwen3-vl:8b`  | 78 / 82 | 359초                         | 한글 닉네임·챔피언 오타, `think:false` 에도 느림 |
| `qwen3-vl:4b`  | 39 / 82 | 98초                          | 한 팀을 통째로 빠뜨림                            |

가짜 점수판은 챔피언 **이름**을 글자로 넣었다. 실제 결과창은 아이콘만 있으므로
실제 캡처로 다시 재야 한다 — 이 탭이 그걸 하려고 있는 것이다.

## 모델 고르는 기준 (GTX 1080, VRAM 8GB)

| 모델           | VRAM(4비트)     | 메모                                |
| -------------- | --------------- | ----------------------------------- |
| `qwen2.5vl:7b` | 약 6GB + 이미지 | 표·문서 읽기에 강한 편. 기본값      |
| `qwen3-vl:8b`  | 약 6~7GB        | 더 최신, 더 빠듯                    |
| `qwen3-vl:4b`  | 약 3.5GB        | 빠르고 여유. 정확도는 실측으로 판단 |

- 1080p 캡처 한 장은 이미지 토큰만 약 2,600개다. 서버가 긴 변을 1920px 로 줄여서 넣는다.
- 챔피언은 아이콘만 보이므로 모델이 틀리기 쉽다. 정식 기능에서는 DDragon 아이콘 대조로 보강한다.
- 라이엇 ID 는 방 참가자 10명 중에서 고르는 식으로 보정할 수 있다(정식 기능 몫).
