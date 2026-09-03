import { redirect } from "next/navigation";

/**
 * `/lol` 처럼 게임만 찍고 들어온 경우. 그 게임의 첫 화면은 내전 목록이다.
 * (모르는 게임 이름은 layout 에서 이미 걸러진다)
 */
export default async function GameHome({
  params,
}: {
  params: Promise<{ game: string }>;
}) {
  const { game } = await params;
  redirect(`/${game}/tournaments`);
}
