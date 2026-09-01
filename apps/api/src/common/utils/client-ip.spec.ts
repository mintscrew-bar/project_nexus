import * as express from "express";
import type { Server } from "http";
import type { AddressInfo } from "net";
import { getClientIp } from "./client-ip";

// main.ts가 사용하는 기본 신뢰 프록시 목록과 동일하게 유지한다.
const TRUSTED_PROXIES = ["loopback", "linklocal", "uniquelocal"];

/**
 * 실제 Express 인스턴스를 띄워 진짜 HTTP 요청을 보낸다.
 * req.ip 계산은 Express/proxy-addr의 동작에 달려 있어서 mock으로는 검증되지 않는다.
 */
async function withServer(
  trustProxy: unknown,
  run: (port: number) => Promise<void>,
): Promise<void> {
  const app = express();
  app.set("trust proxy", trustProxy);
  app.get("/ip", (req, res) => {
    res.json({
      resolved: getClientIp(req),
      // 이전 구현이 쓰던 값 — 위조 가능함을 대조하기 위해 함께 노출
      leftmost:
        Array.isArray(req.ips) && req.ips.length > 0 ? req.ips[0] : null,
    });
  });

  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });

  try {
    await run((server.address() as AddressInfo).port);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

async function fetchIp(port: number, forwardedFor?: string) {
  const res = await fetch(`http://127.0.0.1:${port}/ip`, {
    headers: forwardedFor ? { "X-Forwarded-For": forwardedFor } : {},
  });
  return res.json() as Promise<{ resolved: string; leftmost: string | null }>;
}

describe("getClientIp", () => {
  const FORGED = "1.2.3.4";
  const REAL = "203.0.113.9";

  it("신뢰 프록시를 사설 대역으로 좁히면 위조된 앞쪽 XFF 값을 채택하지 않는다", async () => {
    // 공격자가 헤더 앞에 임의 IP를 끼워 넣고, 그 뒤에 엣지가 실제 IP를 덧붙인 상황
    await withServer(TRUSTED_PROXIES, async (port) => {
      const body = await fetchIp(port, `${FORGED}, ${REAL}`);
      expect(body.resolved).toBe(REAL);
      expect(body.resolved).not.toBe(FORGED);
    });
  });

  it("trust proxy=true는 같은 요청에서 위조값을 그대로 채택한다 (회귀 방지용 대조군)", async () => {
    await withServer(true, async (port) => {
      const body = await fetchIp(port, `${FORGED}, ${REAL}`);
      // 이 설정으로 되돌리면 rate limit이 헤더 한 줄로 우회된다.
      expect(body.resolved).toBe(FORGED);
    });
  });

  it("trust proxy=true에서는 req.ips[0]도 함께 위조값이 된다", async () => {
    // 취약점의 근본 원인은 trust proxy=true 하나다.
    // 모든 홉을 신뢰하면 proxy-addr가 XFF를 끝까지 거슬러 올라가므로
    // req.ip와 req.ips[0]이 똑같이 공격자가 넣은 앞쪽 값을 가리킨다.
    await withServer(true, async (port) => {
      const body = await fetchIp(port, `${FORGED}, ${REAL}`);
      expect(body.resolved).toBe(FORGED);
      expect(body.leftmost).toBe(FORGED);
    });
  });

  it("신뢰 범위를 좁히면 req.ips[0]도 위조 구간을 잘라낸다", async () => {
    // proxy-addr는 신뢰하지 않는 주소를 만나면 배열을 거기서 끊는다.
    // 그래서 trust proxy만 제대로 잡으면 두 접근 모두 실제 IP로 수렴한다.
    await withServer(TRUSTED_PROXIES, async (port) => {
      const body = await fetchIp(port, `${FORGED}, ${REAL}`);
      expect(body.resolved).toBe(REAL);
      expect(body.leftmost).toBe(REAL);
    });
  });

  it("신뢰 프록시가 넣은 단일 XFF 값은 그대로 사용한다", async () => {
    // 운영에서 nginx가 CF-Connecting-IP로 덮어쓴 뒤의 정상 형태
    await withServer(TRUSTED_PROXIES, async (port) => {
      const body = await fetchIp(port, REAL);
      expect(body.resolved).toBe(REAL);
    });
  });

  it("XFF가 없으면 소켓 주소로 떨어진다", async () => {
    await withServer(TRUSTED_PROXIES, async (port) => {
      const body = await fetchIp(port);
      expect(body.resolved).toBe("127.0.0.1");
    });
  });

  it("req가 없거나 IP를 못 구하면 unknown을 반환한다", () => {
    expect(getClientIp(null)).toBe("unknown");
    expect(getClientIp({})).toBe("unknown");
    expect(getClientIp({ socket: { remoteAddress: "10.0.0.5" } })).toBe(
      "10.0.0.5",
    );
  });
});
