"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/auth-store";
import { clanApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Button,
  Input,
  Label,
} from "@/components/ui";
import { ArrowLeft, Shield, Plus } from "lucide-react";

export default function CreateClanPage() {
  const router = useRouter();
  const { isAuthenticated, isLoading: authLoading } = useAuthStore();

  const [name, setName] = useState("");
  const [tag, setTag] = useState("");
  const [description, setDescription] = useState("");
  const [isRecruiting, setIsRecruiting] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push("/auth/login");
    }
  }, [isAuthenticated, authLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError("클랜 이름을 입력해주세요.");
      return;
    }
    if (!tag.trim()) {
      setError("클랜 태그를 입력해주세요.");
      return;
    }
    if (tag.length < 2 || tag.length > 5) {
      setError("클랜 태그는 2~5자여야 합니다.");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const clan = await clanApi.createClan({
        name: name.trim(),
        tag: tag.trim().toUpperCase(),
        description: description.trim() || undefined,
        isRecruiting,
      });
      router.push(`/clans/${clan.id}`);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || "클랜 생성에 실패했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (authLoading) {
    return null;
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-2xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push("/clans")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          클랜 목록
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-accent-primary" />
              클랜 만들기
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Clan Name */}
              <div>
                <Label htmlFor="name">클랜 이름</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="클랜 이름을 입력하세요"
                  className="mt-1"
                  maxLength={30}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  최대 30자까지 입력 가능
                </p>
              </div>

              {/* Clan Tag */}
              <div>
                <Label htmlFor="tag">클랜 태그</Label>
                <Input
                  id="tag"
                  value={tag}
                  onChange={(e) => setTag(e.target.value.toUpperCase())}
                  placeholder="예: NEXUS"
                  className="mt-1 uppercase"
                  maxLength={5}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  2~5자의 영문/숫자 (클랜명 앞에 표시됩니다)
                </p>
              </div>

              {/* Description */}
              <div>
                <Label htmlFor="description">클랜 소개 (선택)</Label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="클랜을 소개해주세요"
                  rows={4}
                  className="mt-1 w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
                  maxLength={500}
                />
                <p className="text-xs text-text-tertiary mt-1">
                  최대 500자까지 입력 가능
                </p>
              </div>

              {/* Recruiting Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <Label>클랜원 모집</Label>
                  <p className="text-xs text-text-tertiary">
                    활성화하면 다른 유저가 클랜에 가입할 수 있습니다
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsRecruiting(!isRecruiting)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                    isRecruiting ? "bg-accent-primary" : "bg-bg-elevated"
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      isRecruiting ? "translate-x-6" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-accent-danger/10 border border-accent-danger/30 rounded-lg p-3">
                  <p className="text-accent-danger text-sm">{error}</p>
                </div>
              )}

              {/* Submit */}
              <div className="flex justify-end gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={() => router.push("/clans")}
                >
                  취소
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  <Plus className="h-4 w-4 mr-2" />
                  {isSubmitting ? "생성 중..." : "클랜 만들기"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
