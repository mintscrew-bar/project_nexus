import Link from "next/link";

export const metadata = {
  title: "개인정보처리방침 | Project Nexus",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-text-primary">
      <h1 className="text-2xl font-bold mb-2">개인정보처리방침</h1>
      <p className="text-sm text-text-tertiary mb-10">
        시행일: 2026년 1월 1일 &nbsp;|&nbsp; 최종 수정일: 2026년 3월 1일
      </p>

      <Section title="1. 수집하는 개인정보 항목">
        <p>Project Nexus(이하 &quot;서비스&quot;)는 다음의 개인정보를 수집합니다.</p>
        <Table
          headers={["구분", "항목", "수집 방법"]}
          rows={[
            ["필수", "이메일 주소, 비밀번호(해시)", "회원가입"],
            ["필수", "소셜 계정 식별자(Google/Discord ID)", "OAuth 연동"],
            ["선택", "닉네임, 프로필 이미지", "프로필 설정"],
            ["선택", "Riot 게임명, 태그, 티어", "Riot 계정 연동"],
            ["자동", "접속 IP, 접속 일시, 서비스 이용 기록", "서비스 이용"],
          ]}
        />
      </Section>

      <Section title="2. 개인정보의 수집 및 이용 목적">
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>회원 식별 및 서비스 제공 (이용계약 이행)</li>
          <li>내전(커스텀 게임) 매칭 및 MMR 산정</li>
          <li>친구 관계 및 1:1 메시지 기능 제공</li>
          <li>클랜 활동 및 클랜 채팅 기능 제공</li>
          <li>신고 접수 및 이용 제한 조치</li>
          <li>서비스 운영·보안·부정이용 방지</li>
        </ul>
      </Section>

      <Section title="3. 개인정보의 보유 및 이용 기간">
        <Table
          headers={["항목", "보유 기간", "근거"]}
          rows={[
            ["회원 정보", "회원 탈퇴 시까지", "이용계약"],
            ["채팅 로그 (방·클랜)", "최대 1년", "운영·분쟁 대응"],
            ["1:1 다이렉트 메시지", "회원 탈퇴 후 즉시 파기 또는 최대 90일", "최소 수집 원칙"],
            ["접속 로그", "3개월", "통신비밀보호법"],
            ["신고·제재 기록", "3년", "분쟁 대응"],
            ["리그 오브 레전드 매치 데이터 캐시", "영구 보관 (변경 불가능한 게임 기록)", "Riot Games API 정책 준수·서비스 운영"],
          ]}
        />
      </Section>

      <Section title="4. 채팅 메시지 처리 방침">
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>
            <strong>내전방 채팅:</strong> 서비스 운영 목적(신고 대응, 불법행위 조사)으로 저장되며,
            운영자가 검토할 수 있습니다. 이 사실은 이용약관에 명시됩니다.
          </li>
          <li>
            <strong>클랜 채팅:</strong> 클랜 멤버 간 공유 메시지로 저장되며,
            신고가 접수된 경우에 한해 운영자가 해당 메시지를 확인할 수 있습니다.
          </li>
          <li>
            <strong>1:1 다이렉트 메시지(DM):</strong> 발신자·수신자 외 제3자(운영자 포함)는
            원칙적으로 열람하지 않습니다. 단, 수사기관의 적법한 요청이 있는 경우 법령에 따라 제공될
            수 있습니다.
          </li>
        </ul>
      </Section>

      <Section title="5. 개인정보의 제3자 제공">
        <p className="text-sm">
          서비스는 원칙적으로 이용자의 개인정보를 제3자에게 제공하지 않습니다. 다만, 다음의 경우는
          예외입니다.
        </p>
        <ul className="list-disc pl-5 space-y-1.5 text-sm mt-2">
          <li>이용자가 사전에 동의한 경우</li>
          <li>법령에 의거하거나 수사기관이 적법한 절차에 따라 요청하는 경우</li>
        </ul>
      </Section>

      <Section title="6. 외부 서비스 연동">
        <Table
          headers={["서비스", "제공 정보", "목적"]}
          rows={[
            ["Riot Games API", "게임명, 태그, 티어 조회", "MMR 산정, 내전 참여 조건 확인"],
            ["Discord OAuth", "Discord 사용자 ID", "계정 연동, 음성채널 자동 이동"],
            ["Google OAuth", "이메일, 기본 프로필", "소셜 로그인"],
          ]}
        />
      </Section>

      <Section title="7. 이용자의 권리">
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>개인정보 열람, 정정, 삭제, 처리 정지 요청 가능</li>
          <li>설정 페이지에서 직접 프로필 수정 및 계정 삭제 가능</li>
          <li>문의: 서비스 내 신고·문의 기능 또는 관리자에게 연락</li>
        </ul>
      </Section>

      <Section title="8. 개인정보의 파기 절차 및 방법">
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>보유 기간이 경과하거나 이용자가 탈퇴를 요청하면 지체 없이 해당 개인정보를 파기합니다.</li>
          <li><strong>전자적 파일:</strong> 복구·재생이 불가능한 기술적 방법(데이터베이스 영구 삭제)으로 삭제합니다.</li>
          <li><strong>접속 로그 등 자동 수집 데이터:</strong> 보유 기간 경과 후 시스템에서 자동 만료·삭제됩니다.</li>
          <li>탈퇴 후 채팅 메시지는 발신자 정보가 익명(알 수 없음)으로 처리되며, 메시지 내용 자체는 서비스 운영 목적으로 보유 기간 동안 유지될 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="9. 쿠키(Cookie) 운영">
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>서비스는 로그인 상태 유지·세션 관리 목적으로 쿠키를 사용합니다.</li>
          <li>이용자는 브라우저 설정에서 쿠키 저장을 거부할 수 있습니다. 단, 거부 시 로그인이 유지되지 않아 일부 서비스 이용이 제한될 수 있습니다.</li>
          <li>쿠키 거부 방법: 브라우저 설정 → 개인정보/쿠키 → 쿠키 차단 또는 삭제</li>
        </ul>
      </Section>

      <Section title="10. 개인정보의 안전성 확보 조치">
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>비밀번호 bcrypt 단방향 암호화 저장</li>
          <li>전송 구간 TLS 암호화</li>
          <li>접근 권한 최소화 (역할별 API 인가)</li>
          <li>관리자 작업 감사 로그(Audit Log) 기록</li>
        </ul>
      </Section>

      <Section title="11. 개인정보 보호책임자">
        <Table
          headers={["구분", "내용"]}
          rows={[
            ["책임자", "Harumaroon (서비스 운영자)"],
            ["이메일", "nexuscshelper@gmail.com"],
            ["처리 기간", "접수 후 10일 이내 답변"],
          ]}
        />
        <p className="text-sm mt-2">
          개인정보 침해로 인한 신고·상담은{" "}
          <a href="https://www.privacy.go.kr" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">
            개인정보보호위원회
          </a>{" "}
          또는{" "}
          <a href="https://cyberbureau.police.go.kr" target="_blank" rel="noopener noreferrer" className="text-accent-primary hover:underline">
            경찰청 사이버범죄신고시스템
          </a>
          을 이용하실 수 있습니다.
        </p>
      </Section>

      <Section title="12. 개인정보처리방침의 변경">
        <ul className="list-disc pl-5 space-y-1.5 text-sm">
          <li>본 방침이 변경되는 경우 시행 7일 전 서비스 내 공지사항을 통해 안내합니다. 중요한 변경의 경우 30일 전 공지합니다.</li>
          <li>변경된 방침은 공지된 시행일부터 효력이 발생합니다.</li>
        </ul>
      </Section>

      <div className="mt-10 pt-6 border-t border-bg-tertiary text-sm text-text-tertiary flex gap-4">
        <Link href="/terms" className="hover:text-text-secondary transition-colors">
          이용약관
        </Link>
        <Link href="/" className="hover:text-text-secondary transition-colors">
          홈으로
        </Link>
      </div>
    </div>
  );
}

// ─── 공통 UI 헬퍼 ─────────────────────────────────────────────────────────────
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-base font-semibold text-text-primary mb-3 pb-1 border-b border-bg-tertiary">
        {title}
      </h2>
      <div className="text-sm text-text-secondary leading-relaxed">{children}</div>
    </section>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: string[][] }) {
  return (
    <div className="overflow-x-auto mt-3">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="bg-bg-tertiary">
            {headers.map((h) => (
              <th
                key={h}
                className="px-3 py-2 text-left text-text-secondary font-medium border border-bg-elevated text-xs"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b border-bg-tertiary hover:bg-bg-secondary/50">
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-text-secondary border border-bg-tertiary">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
