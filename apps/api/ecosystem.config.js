// PM2 프로세스 관리 설정
// 프로덕션 환경에서 자동 재시작, 클러스터 모드, 메모리 제한 등을 관리
module.exports = {
  apps: [
    {
      name: "nexus-api",
      script: "dist/main.js",

      // Discord 봇과 cron 작업은 프로세스별로 실행되므로 기본은 단일 인스턴스.
      // 수평 확장은 봇/cron을 별도 worker로 분리한 뒤 다시 검토한다.
      instances: 1,
      exec_mode: "fork",

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

      // Graceful shutdown — 드레인(60초) + NestJS 연결 정리(10초) 여유 포함
      kill_timeout: 75000,
      listen_timeout: 10000,

      // PM2 ready 신호 대기
      wait_ready: true,
    },
  ],
};
