import Link from "next/link";
import { Shield } from "lucide-react";

interface LobbyErrorStateProps {
  error: string;
  onGoSettings: () => void;
  onGoProfile: () => void;
}

export function LobbyErrorState({ error, onGoSettings, onGoProfile }: LobbyErrorStateProps) {
  const [errorType, errorMessage] = error.includes("::") ? error.split("::") : ["UNKNOWN", error];
  const isDiscordError = errorType === "DISCORD_NOT_LINKED";
  const isRiotError = errorType === "RIOT_NOT_LINKED";

  return (
    <div className="flex-grow flex items-center justify-center p-8">
      <div className="bg-bg-secondary border border-bg-tertiary rounded-xl p-8 max-w-md">
        <div className="text-center mb-6">
          <div className={`w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center ${
            isDiscordError || isRiotError ? "bg-accent-warning/10" : "bg-accent-danger/10"
          }`}>
            <Shield className={`h-8 w-8 ${
              isDiscordError || isRiotError ? "text-accent-warning" : "text-accent-danger"
            }`} />
          </div>
          <h2 className="text-xl font-bold text-text-primary mb-2">
            {isDiscordError && "Discord 계정 연동 필요"}
            {isRiotError && "Riot 계정 연동 필요"}
            {!isDiscordError && !isRiotError && "로비 입장 실패"}
          </h2>
          <p className="text-text-secondary">{errorMessage}</p>
        </div>

        <div className="flex flex-col gap-2">
          {isDiscordError && (
            <button onClick={onGoSettings} className="w-full px-4 py-3 bg-accent-primary text-white rounded-lg font-medium hover:bg-accent-primary/90 transition-colors">
              설정에서 Discord 연동하기
            </button>
          )}
          {isRiotError && (
            <button onClick={onGoProfile} className="w-full px-4 py-3 bg-accent-primary text-white rounded-lg font-medium hover:bg-accent-primary/90 transition-colors">
              프로필에서 Riot 계정 연동하기
            </button>
          )}
          <Link href="/tournaments" className="w-full px-4 py-3 bg-bg-tertiary text-text-primary text-center rounded-lg font-medium hover:bg-bg-elevated transition-colors">
            로비 목록으로 돌아가기
          </Link>
        </div>
      </div>
    </div>
  );
}
