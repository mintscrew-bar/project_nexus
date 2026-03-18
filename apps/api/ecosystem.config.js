// PM2 프로세스 관리 설정
// 프로덕션 환경에서 자동 재시작, 클러스터 모드, 메모리 제한 등을 관리
module.exports = {
  apps: [
    {
      name: "nexus-api",
      script: "dist/main.js",

      // 클러스터 모드: CPU 코어 수에 맞춰 워커 프로세스 생성
      // Docker 컨테이너 내에서는 할당된 CPU에 맞게 조절됨
      instances: "max",
      exec_mode: "cluster",

      // 메모리 제한: 512MB 초과 시 자동 재시작
      max_memory_restart: "512M",

      // 크래시 시 자동 재시작
      autorestart: true,

      // 재시작 딜레이 (ms) — 빠른 크래시 루프 방지
      restart_delay: 3000,

      // 15초 안에 15회 이상 재시작하면 중단 (무한 크래시 루프 방지)
      max_restarts: 15,
      min_uptime: "15s",

      // 환경 변수
      env: {
        NODE_ENV: "production",
      },

      // 로그 설정
      log_date_format: "YYYY-MM-DD HH:mm:ss Z",
      error_file: "/app/logs/error.log",
      out_file: "/app/logs/out.log",
      merge_logs: true,

      // 로그 파일 크기 제한 (10MB 초과 시 로테이션)
      max_size: "10M",

      // Graceful shutdown — NestJS가 연결 정리할 시간 확보
      kill_timeout: 5000,
      listen_timeout: 10000,

      // 무중단 재배포 (클러스터 모드에서 하나씩 재시작)
      wait_ready: true,
    },
  ],
};
