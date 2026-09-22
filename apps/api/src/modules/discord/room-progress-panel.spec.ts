import { MessageFlags } from "discord.js";
import {
  buildRoomDissolvedPanel,
  buildRoomProgressPanel,
  lolChampionId,
  seriesStageLabel,
  type RoomProgressSeries,
  type RoomProgressSnapshot,
} from "./room-progress-panel";

/** V2 컨테이너에서 텍스트 조각만 순서대로 뽑는다 */
const textOf = (payload: ReturnType<typeof buildRoomProgressPanel>) => {
  const out: string[] = [];
  const walk = (component: any) => {
    if (component.type === 10) out.push(component.content); // TextDisplay
    for (const child of component.components ?? []) walk(child);
    if (component.accessory) walk(component.accessory);
  };
  walk(payload.components[0].toJSON());
  return out.join("\n");
};

/** V2 컨테이너 안의 모든 버튼 */
const buttonsOf = (payload: ReturnType<typeof buildRoomProgressPanel>) => {
  const out: Array<{ label: string; url?: string }> = [];
  const walk = (component: any) => {
    if (component.type === 2) out.push(component); // Button
    for (const child of component.components ?? []) walk(child);
    if (component.accessory) walk(component.accessory);
  };
  walk(payload.components[0].toJSON());
  return out;
};

const links = {
  lobbyUrl: "https://labs-nexus.com/lol/tournaments/r1/lobby",
  resultUrl: "https://labs-nexus.com/lol/tournaments/r1/bracket",
  voiceUrl: "https://discord.com/channels/g1/v1",
};

const snapshot = (
  overrides: Partial<RoomProgressSnapshot> = {},
): RoomProgressSnapshot => ({
  roomName: "금요일 내전",
  hostName: "호스트",
  gameTitle: "LOL",
  teamMode: "AUCTION",
  isPrivate: false,
  status: "DRAFT",
  finishedAt: null,
  teams: [],
  series: [],
  scrim: null,
  ...overrides,
});

const series = (
  overrides: Partial<RoomProgressSeries> = {},
): RoomProgressSeries => ({
  round: 1,
  matchNumber: 1,
  bracketRound: null,
  bracketType: "SINGLE_ELIMINATION",
  teamAId: "ta",
  teamAName: "블루팀",
  teamBId: "tb",
  teamBName: "레드팀",
  winsA: 0,
  winsB: 0,
  bestOf: 1,
  status: "PENDING",
  winnerId: null,
  ...overrides,
});

describe("seriesStageLabel", () => {
  it("웹 방송 제어 화면과 같은 이름을 쓴다", () => {
    expect(seriesStageLabel(series({ round: 3 }), 3)).toBe("결승");
    expect(seriesStageLabel(series({ round: 2 }), 3)).toBe("4강");
    expect(seriesStageLabel(series({ round: 1 }), 3)).toBe("8강");
    expect(seriesStageLabel(series({ bracketRound: "GF" }), 4)).toBe("결승");
    expect(seriesStageLabel(series({ bracketRound: "WB_F" }), 4)).toBe(
      "승자조 결승",
    );
    expect(seriesStageLabel(series({ bracketRound: "LB_R1" }), 4)).toBe(
      "패자조",
    );
  });

  it("2팀 단판은 결승이 아니라 매치, 리그는 라운드로 부른다", () => {
    expect(seriesStageLabel(series({ bracketType: "SINGLE" }), 1)).toBe("매치");
    expect(
      seriesStageLabel(series({ bracketType: "ROUND_ROBIN", round: 2 }), 3),
    ).toBe("리그 2R");
  });
});

describe("lolChampionId", () => {
  it("토너먼트는 마지막 라운드 승자다", () => {
    expect(
      lolChampionId([
        series({ round: 1, winnerId: "ta" }),
        series({ round: 1, matchNumber: 2, winnerId: "tc" }),
        series({ round: 2, teamAId: "ta", teamBId: "tc", winnerId: "tc" }),
      ]),
    ).toBe("tc");
  });

  it("더블 일리미네이션은 그랜드 파이널 승자다", () => {
    expect(
      lolChampionId([
        series({ round: 5, bracketRound: "LB_F", winnerId: "tb" }),
        series({ round: 4, bracketRound: "GF", winnerId: "ta" }),
      ]),
    ).toBe("ta");
  });

  it("리그는 승수, 같으면 세트 득실로 가른다", () => {
    const league = (o: Partial<RoomProgressSeries>) =>
      series({ bracketType: "ROUND_ROBIN", ...o });
    // A·B·C 모두 1승 1패. 세트 득실: A +1, B -1, C 0 → A 우승
    expect(
      lolChampionId([
        league({
          teamAId: "a",
          teamBId: "b",
          winsA: 2,
          winsB: 0,
          winnerId: "a",
        }),
        league({
          teamAId: "b",
          teamBId: "c",
          winsA: 2,
          winsB: 1,
          winnerId: "b",
        }),
        league({
          teamAId: "c",
          teamBId: "a",
          winsA: 2,
          winsB: 1,
          winnerId: "c",
        }),
      ]),
    ).toBe("a");
  });

  it("끝난 경기가 없으면 우승 팀도 없다", () => {
    expect(lolChampionId([series()])).toBeNull();
  });
});

describe("buildRoomProgressPanel", () => {
  it("V2 메시지로 만들고 역할 멘션은 막는다", () => {
    const payload = buildRoomProgressPanel(snapshot(), links);
    expect(payload.flags).toBe(MessageFlags.IsComponentsV2);
    expect(payload.allowedMentions).toEqual({ roles: [] });
  });

  it("경매 중에는 단계와 지금까지 뽑힌 명단을 보여주고 로비로 보낸다", () => {
    const payload = buildRoomProgressPanel(
      snapshot({
        teams: [
          { id: "ta", name: "1팀", captainName: "팀장1", members: ["선수A"] },
          { id: "tb", name: "2팀", captainName: "팀장2", members: [] },
        ],
      }),
      links,
    );
    const text = textOf(payload);
    expect(text).toContain("경매 진행 중");
    expect(text).toContain("**1팀**  👑 팀장1 · 선수A");
    expect(text).toContain("**2팀**  👑 팀장2");
    // 대진이 아직 없으니 대진표 대신 로비
    const header = buttonsOf(payload)[0];
    expect(header.label).toBe("로비 보기");
    expect(header.url).toBe(links.lobbyUrl);
  });

  it("참가하기 버튼은 어떤 진행 단계에서도 달지 않는다", () => {
    for (const status of [
      "DRAFT",
      "DRAFT_COMPLETED",
      "IN_PROGRESS",
      "COMPLETED",
    ] as const) {
      const labels = buttonsOf(
        buildRoomProgressPanel(snapshot({ status }), links),
      ).map((button) => button.label);
      expect(labels).not.toContain("참가하기");
      expect(labels).not.toContain("룸 참가");
    }
  });

  it("롤 경기 중에는 세트 스코어와 진행 중인 대진을 보여준다", () => {
    const payload = buildRoomProgressPanel(
      snapshot({
        status: "IN_PROGRESS",
        series: [
          series({
            round: 1,
            winnerId: "ta",
            winsA: 2,
            winsB: 1,
            bestOf: 3,
            status: "COMPLETED",
          }),
          series({
            round: 1,
            matchNumber: 2,
            teamAId: "tc",
            teamAName: "초록팀",
            teamBId: "td",
            teamBName: "노랑팀",
            winsA: 1,
            status: "IN_PROGRESS",
          }),
          series({ round: 2, teamAName: null, teamBName: null }),
        ],
      }),
      links,
    );
    const text = textOf(payload);
    expect(text).toContain("경기 진행 중");
    expect(text).toContain("`4강` **블루팀** 2 : 1 레드팀 (BO3)");
    expect(text).toContain("`4강` 초록팀 1 : 0 노랑팀 · 🔴 진행 중");
    expect(text).toContain("`결승` 미정 vs 미정");
    expect(buttonsOf(payload)[0].label).toBe("대진표 보기");
  });

  it("종료 카드는 우승 팀을 올리고 명단·음성채널 버튼은 뺀다", () => {
    const finishedAt = new Date("2026-09-22T12:00:00Z");
    const payload = buildRoomProgressPanel(
      snapshot({
        status: "COMPLETED",
        finishedAt,
        teams: [
          {
            id: "ta",
            name: "블루팀",
            captainName: "팀장",
            members: ["A", "B"],
          },
          { id: "tb", name: "레드팀", captainName: "팀장2", members: ["C"] },
        ],
        series: [series({ bracketType: "SINGLE", winnerId: "ta", winsA: 1 })],
      }),
      links,
    );
    const text = textOf(payload);
    expect(text).toContain("내전 종료");
    expect(text).toContain("🏆 **우승 블루팀**");
    expect(text).toContain("-# 팀장 · A · B");
    expect(text).not.toContain("**팀 명단**");
    expect(text).toContain(`<t:${finishedAt.getTime() / 1000}:f> 종료`);
    expect(buttonsOf(payload).map((b) => b.label)).not.toContain(
      "음성채널 참가",
    );
  });

  it("진행 중에는 원 서버 공지에만 음성채널 버튼을 단다", () => {
    const origin = buttonsOf(
      buildRoomProgressPanel(snapshot({ status: "IN_PROGRESS" }), links),
    );
    expect(origin.map((b) => b.label)).toContain("음성채널 참가");

    const copy = buildRoomProgressPanel(snapshot({ status: "IN_PROGRESS" }), {
      ...links,
      voiceUrl: null,
      originGuildName: "원 서버",
    });
    expect(buttonsOf(copy).map((b) => b.label)).not.toContain("음성채널 참가");
    expect(textOf(copy)).toContain("**원 서버** 서버에서 열린 내전입니다");
  });

  it("팀이 많으면 명단 대신 개수만 쓴다", () => {
    const teams = Array.from({ length: 12 }, (_, index) => ({
      id: `t${index}`,
      name: `스쿼드${index}`,
      captainName: `팀장${index}`,
      members: ["a", "b", "c"],
    }));
    const text = textOf(
      buildRoomProgressPanel(
        snapshot({ gameTitle: "PUBG", status: "DRAFT_COMPLETED", teams }),
        links,
      ),
    );
    expect(text).toContain("**스쿼드** 12개 편성");
    expect(text).not.toContain("팀장3");
  });

  describe("배그", () => {
    const standings = Array.from({ length: 7 }, (_, index) => ({
      teamName: `스쿼드${index + 1}`,
      totalPoints: 40 - index * 5,
      totalKills: 10 - index,
    }));

    it("배틀로얄은 몇 번째 판인지와 상위 5팀을 보여준다", () => {
      const payload = buildRoomProgressPanel(
        snapshot({
          gameTitle: "PUBG",
          status: "IN_PROGRESS",
          scrim: {
            status: "IN_PROGRESS",
            totalRounds: 5,
            completedRounds: 2,
            timed: false,
            cutoffAt: null,
            standings,
          },
        }),
        {
          ...links,
          resultUrl: "https://labs-nexus.com/pubg/tournaments/r1/scrim",
        },
      );
      const text = textOf(payload);
      expect(text).toContain("3라운드 진행 중** · 총 5판");
      expect(text).toContain("**순위** · 2 / 5판");
      expect(text).toContain("`1` 스쿼드1 — **40**점 · 킬 10");
      expect(text).toContain("`5` 스쿼드5");
      expect(text).not.toContain("스쿼드6");
      expect(buttonsOf(payload)[0].label).toBe("리더보드 보기");
    });

    it("한 판도 끝나기 전에는 0점 순위를 보여주지 않는다", () => {
      const text = textOf(
        buildRoomProgressPanel(
          snapshot({
            gameTitle: "PUBG",
            status: "IN_PROGRESS",
            scrim: {
              status: "IN_PROGRESS",
              totalRounds: 3,
              completedRounds: 0,
              timed: false,
              cutoffAt: null,
              standings,
            },
          }),
          links,
        ),
      );
      expect(text).toContain("1라운드 진행 중");
      expect(text).not.toContain("**순위**");
    });

    it("킬내기는 라운드 대신 종료 시각을, 시작 전에는 대기를 보여준다", () => {
      const cutoffAt = new Date("2026-09-22T13:00:00Z");
      const base = {
        totalRounds: 1,
        completedRounds: 0,
        timed: true,
        cutoffAt,
        standings,
      };
      const waiting = textOf(
        buildRoomProgressPanel(
          snapshot({
            gameTitle: "PUBG",
            status: "IN_PROGRESS",
            scrim: { ...base, status: "PENDING" },
          }),
          links,
        ),
      );
      expect(waiting).toContain("킬내기 시작 대기");

      const live = textOf(
        buildRoomProgressPanel(
          snapshot({
            gameTitle: "PUBG",
            status: "IN_PROGRESS",
            scrim: { ...base, status: "IN_PROGRESS", completedRounds: 3 },
          }),
          links,
        ),
      );
      expect(live).toContain(`<t:${cutoffAt.getTime() / 1000}:R> 종료`);
      expect(live).toContain("**순위** · 3판 집계");
    });

    it("종료 카드는 1위 스쿼드를 올린다", () => {
      const text = textOf(
        buildRoomProgressPanel(
          snapshot({
            gameTitle: "PUBG",
            status: "COMPLETED",
            scrim: {
              status: "COMPLETED",
              totalRounds: 3,
              completedRounds: 3,
              timed: false,
              cutoffAt: null,
              standings,
            },
          }),
          links,
        ),
      );
      expect(text).toContain("🏆 **1위 스쿼드1** — 40점 · 킬 10");
    });
  });
});

describe("buildRoomDissolvedPanel", () => {
  it("해산을 알리고 버튼을 전부 걷어낸다", () => {
    const payload = buildRoomDissolvedPanel("금요일 내전");
    expect(textOf(payload)).toContain("방이 해산되었습니다");
    expect(buttonsOf(payload)).toHaveLength(0);
  });
});
