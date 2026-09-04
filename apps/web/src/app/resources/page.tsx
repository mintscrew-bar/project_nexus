import { GUIDE_BASE } from "@/lib/guide-links";
import { permanentRedirect } from "next/navigation";

export default function LegacyResourcesPage() {
  permanentRedirect(`${GUIDE_BASE}/guide/resources`);
}
