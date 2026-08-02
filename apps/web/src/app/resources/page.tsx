import { permanentRedirect } from "next/navigation";

export default function LegacyResourcesPage() {
  permanentRedirect("/guide/resources");
}
