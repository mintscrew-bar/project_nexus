import { permanentRedirect } from "next/navigation";

export default async function LegacyResourceArticlePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/guide/${slug}`);
}
