"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  ExternalLink,
  Loader2,
  Pencil,
  Plus,
  Radio,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui";
import { ChannelVerifyModal } from "@/components/domain/ChannelVerifyModal";
import { useToast } from "@/components/ui/Toast";
import {
  streamerApi,
  userApi,
  type StreamerLink,
  type StreamerPlatform,
  type StreamerProfile,
} from "@/lib/api-client";

const PLATFORMS: Array<{
  value: StreamerPlatform;
  label: string;
  placeholder: string;
}> = [
  {
    value: "CHZZK",
    label: "치지직",
    placeholder: "https://chzzk.naver.com/...",
  },
  {
    value: "SOOP",
    label: "SOOP",
    placeholder: "https://ch.sooplive.co.kr/...",
  },
  {
    value: "YOUTUBE",
    label: "유튜브",
    placeholder: "https://youtube.com/@...",
  },
];

export function StreamerSettingsSection() {
  const { addToast } = useToast();
  const [profiles, setProfiles] = useState<StreamerProfile[]>([]);
  const [links, setLinks] = useState<StreamerLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [platform, setPlatform] = useState<StreamerPlatform>("CHZZK");
  const [channelUrl, setChannelUrl] = useState("");
  const [channelName, setChannelName] = useState("");
  const [verifying, setVerifying] = useState<StreamerPlatform | null>(null);
  const [linkLabel, setLinkLabel] = useState("");
  const [linkUrl, setLinkUrl] = useState("");
  const [linkImage, setLinkImage] = useState<File | null>(null);
  const [editingLink, setEditingLink] = useState<StreamerLink | null>(null);

  const availablePlatforms = PLATFORMS.filter(
    (item) => !profiles.some((profile) => profile.platform === item.value),
  );
  const selectedPlatform = availablePlatforms.some(
    (item) => item.value === platform,
  )
    ? platform
    : (availablePlatforms[0]?.value ?? "CHZZK");

  const reload = async () => {
    const [nextProfiles, nextLinks] = await Promise.all([
      userApi.getStreamerProfiles(),
      userApi.getStreamerLinks(),
    ]);
    setProfiles(nextProfiles);
    setLinks(nextLinks);
  };

  useEffect(() => {
    reload()
      .catch(() => addToast("방송 설정을 불러오지 못했습니다.", "error"))
      .finally(() => setLoading(false));
  }, [addToast]);

  const saveChannel = async () => {
    if (!channelUrl.trim()) return;
    setSaving(true);
    try {
      await userApi.upsertStreamerProfile({
        platform: selectedPlatform,
        channelUrl: channelUrl.trim(),
        channelName: channelName.trim() || undefined,
      });
      await reload();
      setChannelUrl("");
      setChannelName("");
      addToast("방송 채널을 저장했습니다.", "success");
    } catch (error: any) {
      addToast(
        error?.response?.data?.message || "채널 저장에 실패했습니다.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const deleteChannel = async (value: StreamerPlatform) => {
    if (!confirm("이 방송 채널을 삭제할까요?")) return;
    await userApi.deleteStreamerProfile(value);
    await reload();
    addToast("방송 채널을 삭제했습니다.", "success");
  };

  const connectChzzk = async () => {
    setSaving(true);
    try {
      const { url } = await streamerApi.startChzzkOAuth();
      window.location.assign(url);
    } catch (error: any) {
      addToast(
        error?.response?.data?.message || "치지직 연결을 시작하지 못했습니다.",
        "error",
      );
      setSaving(false);
    }
  };

  const saveLink = async () => {
    if (!linkLabel.trim() || !linkUrl.trim()) return;
    setSaving(true);
    try {
      const saved = editingLink
        ? await userApi.updateStreamerLink(editingLink.id, {
            label: linkLabel.trim(),
            url: linkUrl.trim(),
            order: editingLink.order,
          })
        : await userApi.createStreamerLink({
            label: linkLabel.trim(),
            url: linkUrl.trim(),
            order: links.length,
          });
      if (linkImage) {
        await userApi.uploadStreamerLinkImage(saved.id, linkImage);
      }
      await reload();
      setLinkLabel("");
      setLinkUrl("");
      setLinkImage(null);
      setEditingLink(null);
      addToast("방송 링크를 저장했습니다.", "success");
    } catch (error: any) {
      addToast(
        error?.response?.data?.message || "링크 저장에 실패했습니다.",
        "error",
      );
    } finally {
      setSaving(false);
    }
  };

  const beginEditLink = (link: StreamerLink) => {
    setEditingLink(link);
    setLinkLabel(link.label);
    setLinkUrl(link.url);
    setLinkImage(null);
  };

  const cancelEditLink = () => {
    setEditingLink(null);
    setLinkLabel("");
    setLinkUrl("");
    setLinkImage(null);
  };

  const deleteLink = async (id: string) => {
    if (!confirm("이 링크를 삭제할까요?")) return;
    await userApi.deleteStreamerLink(id);
    await reload();
    addToast("방송 링크를 삭제했습니다.", "success");
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-accent-primary" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Radio className="h-5 w-5 text-accent-primary" />
            방송 채널
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-[#00ffa3]/25 bg-[#00ffa3]/5 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-text-primary">
                  치지직 공식 계정 연결
                </p>
                <p className="mt-1 text-xs text-text-muted">
                  채널 소개 수정 없이 로그인 한 번으로 소유권을 인증합니다.
                </p>
              </div>
              <Button
                onClick={connectChzzk}
                disabled={saving}
                className="shrink-0"
              >
                치지직으로 연결
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            {profiles.map((profile) => (
              <div
                key={profile.platform}
                className="flex flex-wrap items-center gap-3 rounded-xl bg-bg-tertiary/60 p-3"
              >
                <span className="w-14 text-xs font-bold text-text-secondary">
                  {
                    PLATFORMS.find((item) => item.value === profile.platform)
                      ?.label
                  }
                </span>
                <a
                  href={profile.channelUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 flex-1 truncate text-sm text-accent-primary hover:underline"
                >
                  {profile.channelName || profile.channelUrl}
                </a>
                {profile.verifiedAt ? (
                  <span className="flex items-center gap-1 text-xs font-semibold text-[#00d68f]">
                    <ShieldCheck className="h-4 w-4" /> 인증됨
                  </span>
                ) : profile.platform !== "YOUTUBE" ? (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setVerifying(profile.platform)}
                  >
                    코드로 인증
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => deleteChannel(profile.platform)}
                  aria-label="채널 삭제"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>

          {profiles.length < 3 && (
            <div className="grid min-w-0 gap-2 md:grid-cols-[120px_minmax(0,1fr)_160px_auto]">
              <select
                value={selectedPlatform}
                onChange={(event) =>
                  setPlatform(event.target.value as StreamerPlatform)
                }
                className="min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary"
              >
                {availablePlatforms.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <input
                value={channelUrl}
                onChange={(event) => setChannelUrl(event.target.value)}
                placeholder={
                  PLATFORMS.find((item) => item.value === selectedPlatform)
                    ?.placeholder
                }
                className="min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary"
              />
              <input
                value={channelName}
                onChange={(event) => setChannelName(event.target.value)}
                placeholder="채널명 (선택)"
                className="min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary"
              />
              <Button
                onClick={saveChannel}
                disabled={saving || !channelUrl.trim()}
              >
                <Plus className="mr-1 h-4 w-4" />
                추가
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>방송·커뮤니티 링크</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {links.map((link) => (
            <div
              key={link.id}
              className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl bg-bg-tertiary/60 p-3 sm:flex-nowrap sm:gap-3"
            >
              <div className="relative h-10 w-14 flex-shrink-0 overflow-hidden rounded-lg bg-bg-primary">
                {link.imageUrl ? (
                  <Image
                    src={link.imageUrl}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <span className="flex h-full items-center justify-center">
                    <ExternalLink className="h-4 w-4 text-text-muted" />
                  </span>
                )}
              </div>
              <a
                href={link.url}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 flex-1"
              >
                <p className="truncate text-sm font-semibold text-text-primary">
                  {link.label}
                </p>
                <p className="truncate text-xs text-text-muted">{link.url}</p>
              </a>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => beginEditLink(link)}
                aria-label="링크 수정"
              >
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => deleteLink(link.id)}
                aria-label="링크 삭제"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="grid min-w-0 gap-2 md:grid-cols-[180px_minmax(0,1fr)_auto]">
            <input
              value={linkLabel}
              onChange={(event) => setLinkLabel(event.target.value)}
              placeholder="링크 이름"
              className="min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
            <input
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="https://..."
              className="min-w-0 rounded-lg border border-bg-tertiary bg-bg-primary px-3 py-2 text-sm text-text-primary"
            />
            <div className="flex flex-wrap gap-2">
              <label className="inline-flex cursor-pointer items-center rounded-lg border border-bg-tertiary px-3 py-2 text-xs text-text-secondary hover:border-accent-primary/40">
                이미지
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={(event) =>
                    setLinkImage(event.target.files?.[0] ?? null)
                  }
                />
              </label>
              <Button
                variant="outline"
                onClick={saveLink}
                disabled={saving || !linkLabel.trim() || !linkUrl.trim()}
              >
                {editingLink ? "수정 저장" : "링크 추가"}
              </Button>
              {editingLink && (
                <Button variant="ghost" onClick={cancelEditLink}>
                  취소
                </Button>
              )}
            </div>
          </div>
          {linkImage && (
            <p className="text-xs text-text-muted">
              선택한 이미지: {linkImage.name}
            </p>
          )}
        </CardContent>
      </Card>

      {verifying && (
        <ChannelVerifyModal
          platform={verifying}
          onClose={() => setVerifying(null)}
          onVerified={reload}
          addToast={addToast}
        />
      )}
    </>
  );
}
