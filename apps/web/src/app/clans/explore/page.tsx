import { redirect } from "next/navigation";

export default function ClanExplorePage() {
  redirect("/clans?view=explore");
}
