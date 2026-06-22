import Link from "next/link";
import type { Metadata } from "next";
import { absoluteUrl } from "@/lib/seo";

export const metadata: Metadata = {
  title: "이용약관",
  description:
    "Nexus 내전 매칭, 클랜, 커뮤니티, 채팅 기능 이용 조건과 사용자 의무, 신고와 제재 기준을 안내합니다.",
  alternates: {
    canonical: absoluteUrl("/terms"),
  },
};

export default function TermsPage() {
  return (
    <div className="max-w-3xl mx-auto px-6 py-12 text-text-primary">
      <h1 className="text-2xl font-bold mb-2">이용약관</h1>
      <p className="text-sm text-text-tertiary mb-10">
        시행일: 2026년 1월 1일 &nbsp;|&nbsp; 최종 수정일: 2026년 3월 1일
      </p>

      <Section title="제1조 (목적)">
        <p>
          이 약관은 Project Nexus(이하 &quot;서비스&quot;)가 제공하는 리그 오브 레전드 내전(커스텀 게임) 매칭
          및 커뮤니티 서비스의 이용 조건과 절차, 이용자와 서비스 간의 권리·의무 및 책임 사항을
          규정함을 목적으로 합니다.
        </p>
      </Section>

      <Section title="제2조 (정의)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>&quot;서비스&quot;란 Project Nexus가 운영하는 내전 매칭, 클랜, 커뮤니티, 채팅 등 일체의 기능을 말합니다.</li>
          <li>&quot;이용자&quot;란 이 약관에 동의하고 서비스에 가입하여 이용하는 자를 말합니다.</li>
          <li>&quot;내전&quot;이란 이용자 간 리그 오브 레전드 커스텀 게임을 조직하고 진행하는 서비스 내 기능을 말합니다.</li>
          <li>&quot;클랜&quot;이란 서비스 내에서 이용자들이 자발적으로 구성한 그룹을 말합니다.</li>
        </ul>
      </Section>

      <Section title="제3조 (약관의 효력 및 변경)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>이 약관은 서비스에 게시함으로써 효력이 발생합니다.</li>
          <li>
            서비스는 필요한 경우 약관을 변경할 수 있으며, 변경 시 시행 7일 전 공지합니다. 중요한
            변경의 경우 30일 전 공지합니다.
          </li>
          <li>변경된 약관에 동의하지 않는 이용자는 서비스 이용을 중단하고 탈퇴할 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="제4조 (서비스 이용 자격 및 연동 요건)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>서비스 이용을 위해서는 Google 또는 Discord 계정으로 소셜 로그인해야 합니다.</li>
          <li>
            <strong>내전 참여를 위해서는 Riot Games 계정과 Discord 계정 연동이 필수입니다.</strong>
            이는 티어·MMR 확인 및 음성채널 자동 이동을 위한 것입니다.
          </li>
          <li>타인의 계정을 도용하거나 허위 정보를 입력하는 행위는 금지됩니다.</li>
        </ul>
      </Section>

      <Section title="제5조 (채팅 및 메시지 서비스)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>
            <strong>내전방 채팅:</strong> 방 참가자 전원이 볼 수 있는 공개 채팅입니다. 서비스 운영,
            신고 대응, 불법·유해 행위 조사 목적으로 운영자가 열람할 수 있으며,{" "}
            <strong>이에 동의하지 않는 경우 내전방 참가를 삼가시기 바랍니다.</strong>
          </li>
          <li>
            <strong>클랜 채팅:</strong> 클랜 멤버 간 그룹 채팅입니다. 신고가 접수된 경우에 한해
            운영자가 해당 메시지를 확인할 수 있습니다.
          </li>
          <li>
            <strong>1:1 다이렉트 메시지(DM):</strong> 발신자와 수신자만 볼 수 있는 비공개 메시지입니다.
            운영자는 원칙적으로 DM 내용을 열람하지 않습니다. 단, 수사기관의 적법한 요청이 있는 경우
            법령에 따라 제공될 수 있습니다.
          </li>
        </ul>
      </Section>

      <Section title="제6조 (이용자의 의무)">
        <p className="mb-2">이용자는 다음 행위를 해서는 안 됩니다.</p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>타인에 대한 욕설, 비하, 혐오 표현, 성희롱</li>
          <li>게임 트롤링, 의도적 AFK, 그리핑</li>
          <li>치팅 프로그램 사용 또는 이를 조장하는 행위</li>
          <li>스팸, 광고, 허위 정보 유포</li>
          <li>타인의 개인정보 수집·유포</li>
          <li>서비스 시스템에 대한 무단 접근, 해킹 시도</li>
          <li>기타 법령 위반 또는 공서양속에 반하는 행위</li>
        </ul>
      </Section>

      <Section title="제7조 (서비스 이용 제한 및 제재)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>서비스는 이용자가 제6조를 위반하는 경우 경고, 이용 제한, 영구 정지 조치를 취할 수 있습니다.</li>
          <li>제재 조치에 이의가 있는 경우 서비스 내 문의 기능을 통해 이의신청할 수 있습니다.</li>
          <li>위법 행위에 대해서는 관련 법령에 따라 수사기관에 신고할 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="제8조 (서비스 제공의 변경·중단)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>서비스는 운영상 필요에 따라 서비스 내용을 변경하거나 중단할 수 있습니다.</li>
          <li>서비스 중단 시 사전에 공지하며, 불가피한 경우 사후 공지할 수 있습니다.</li>
          <li>서비스는 서비스 중단으로 인한 손해에 대해 고의·과실이 없는 경우 책임을 지지 않습니다.</li>
        </ul>
      </Section>

      <Section title="제9조 (지적재산권)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>서비스의 디자인, 소스 코드, 로고, UI 등 서비스 자체에 관한 저작권 및 지적재산권은 운영자에게 귀속됩니다.</li>
          <li>이용자가 서비스 내에서 작성한 콘텐츠(게시글, 댓글, 채팅 등)의 저작권은 해당 이용자에게 귀속됩니다. 단, 서비스는 운영·개선 목적으로 해당 콘텐츠를 서비스 내에서 이용할 수 있습니다.</li>
          <li>리그 오브 레전드, Riot Games 및 관련 로고·챔피언 이미지·게임 데이터는 Riot Games, Inc.의 상표 또는 저작물이며, 서비스는 Riot Games API 정책에 따라 이를 사용합니다.</li>
        </ul>
      </Section>

      <Section title="제10조 (회원 탈퇴)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>이용자는 언제든지 서비스 내 설정 페이지를 통해 탈퇴를 요청할 수 있으며, 서비스는 지체 없이 처리합니다.</li>
          <li>탈퇴 후 이용자의 개인정보는 개인정보처리방침에 따라 파기됩니다.</li>
          <li>탈퇴 후에도 이용자가 작성한 게시글·댓글·채팅 기록은 서비스 내에 익명으로 남을 수 있습니다. 삭제를 원하는 경우 탈퇴 전 직접 삭제하시기 바랍니다.</li>
          <li>이용 제한 또는 정지 상태에서는 탈퇴가 제한될 수 있습니다.</li>
        </ul>
      </Section>

      <Section title="제11조 (면책조항)">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>서비스는 이용자 간 분쟁에 대해 개입하지 않으며, 이로 인한 손해에 책임을 지지 않습니다.</li>
          <li>천재지변, 서버 장애, Riot Games API 정책 변경 등 불가항력적 사유로 인한 서비스 중단에 대해 책임을 지지 않습니다.</li>
          <li>
            Project Nexus isn&apos;t endorsed by Riot Games and doesn&apos;t reflect the views or
            opinions of Riot Games or anyone officially involved in producing or managing Riot Games
            properties. Riot Games, and all associated properties are trademarks or registered
            trademarks of Riot Games, Inc.
          </li>
        </ul>
      </Section>

      <Section title="제12조 (준거법 및 관할)">
        <p>
          이 약관은 대한민국 법령에 따라 해석되며, 서비스 관련 분쟁은 대한민국 법원을 관할 법원으로
          합니다.
        </p>
      </Section>

      <div className="mt-10 pt-6 border-t border-bg-tertiary text-sm text-text-tertiary flex gap-4">
        <Link href="/privacy" className="hover:text-text-secondary transition-colors">
          개인정보처리방침
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
