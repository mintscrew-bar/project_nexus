"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function LegacyPublicProfileRedirectPage() {
  const params = useParams();
  const router = useRouter();
  const targetId = params.id as string;

  useEffect(() => {
    if (!targetId) return;
    router.replace(`/users/${targetId}`);
  }, [router, targetId]);

  return null;
}
