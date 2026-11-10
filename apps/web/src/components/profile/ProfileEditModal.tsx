"use client";

/**
 * 내 프로필 편집 창 — 닉네임·소개·프로필 사진·배경 이미지.
 *
 * 2026-11 게임 계정 관리 화면을 내 프로필로 합치면서, 그 화면 머리에 있던 편집 기능을
 * 창 하나로 옮겼다. 사진·배경은 고른 뒤 조정 화면(ImageCropper)에서 위치·크기를 맞춰 올리고,
 * 닉네임·소개는 "저장"을 눌러야 반영된다. 올리는 파일은 서버 규칙대로 5MB 이하.
 */

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Camera, User } from "lucide-react";
import { userApi } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { AVATAR_CROP, BANNER_CROP, ImageCropper } from "./ImageCropper";
import { Button, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";

const IMAGE_TYPES = /^image\/(jpeg|jpg|png|gif|webp)$/;
/** 올리는 파일(조정 후) 한도 — 서버 규칙 */
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
/** 고르는 원본 한도 — 조정하면서 줄어들어서 원본은 더 커도 된다 */
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;

export function ProfileEditModal({
  isOpen,
  onClose,
  banner,
  onSaved,
}: {
  isOpen: boolean;
  onClose: () => void;
  /** 지금 배경 이미지 주소 (프로필 응답 기준) */
  banner: string | null;
  /** 저장·업로드가 끝나면 — 프로필을 다시 불러오게 한다 */
  onSaved: () => void;
}) {
  const { user, fetchUser } = useAuthStore();
  const { addToast } = useToast();
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"avatar" | "banner" | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [bannerPreview, setBannerPreview] = useState<string | null>(null);
  // 고른 사진 — 조정 화면을 거친 뒤에 올린다
  const [cropping, setCropping] = useState<{
    file: File;
    kind: "avatar" | "banner";
  } | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);

  // 창을 열 때마다 지금 값으로 채운다
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setUsername(user?.username ?? "");
    setBio(user?.bio ?? "");
    setAvatarPreview(null);
    setBannerPreview(null);
  }, [isOpen, user?.username, user?.bio]);

  const dirty =
    username.trim() !== (user?.username ?? "") ||
    bio.trim() !== (user?.bio ?? "");

  const save = async () => {
    if (!username.trim()) {
      addToast("닉네임을 입력해주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      await userApi.updateProfile({
        username: username.trim(),
        bio: bio.trim(),
      });
      await fetchUser();
      onSaved();
      addToast("프로필이 저장되었습니다.", "success");
      onClose();
    } catch (err) {
      // 닉네임 중복 등 이유를 그대로 보여준다
      addToast(getApiErrorMessage(err, "프로필 저장에 실패했습니다."), "error");
    } finally {
      setSaving(false);
    }
  };

  /** 파일을 고르면 형식·크기만 보고 조정 화면으로 넘긴다 */
  const pick = (file: File | undefined, kind: "avatar" | "banner") => {
    const input = kind === "avatar" ? avatarInput.current : bannerInput.current;
    if (input) input.value = "";
    if (!file) return;
    if (!IMAGE_TYPES.test(file.type)) {
      addToast(
        "지원하지 않는 이미지 형식입니다. (jpg, png, gif, webp만 가능)",
        "error",
      );
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      addToast("이미지 크기는 20MB 이하여야 합니다.", "error");
      return;
    }
    setCropping({ file, kind });
  };

  /** 조정한 결과를 올린다 */
  const upload = async (file: File, kind: "avatar" | "banner") => {
    if (file.size > MAX_IMAGE_BYTES) {
      addToast(
        "조정한 이미지가 5MB를 넘습니다. 조금 더 확대해 주세요.",
        "error",
      );
      return;
    }
    // 올라가는 동안 미리보기
    const reader = new FileReader();
    reader.onload = (e) =>
      (kind === "avatar" ? setAvatarPreview : setBannerPreview)(
        e.target?.result as string,
      );
    reader.readAsDataURL(file);

    setUploading(kind);
    try {
      if (kind === "avatar") {
        const res = await userApi.uploadAvatar(file);
        if (res.avatarUrl) setAvatarPreview(res.avatarUrl);
      } else {
        const res = await userApi.uploadProfileBanner(file);
        if (res.profileBannerUrl) setBannerPreview(res.profileBannerUrl);
      }
      await fetchUser();
      onSaved();
      addToast(
        kind === "avatar"
          ? "프로필 사진이 변경되었습니다."
          : "프로필 배경이 변경되었습니다.",
        "success",
      );
    } catch {
      addToast(
        kind === "avatar"
          ? "프로필 사진 업로드에 실패했습니다."
          : "프로필 배경 업로드에 실패했습니다.",
        "error",
      );
      (kind === "avatar" ? setAvatarPreview : setBannerPreview)(null);
    } finally {
      setUploading(null);
    }
  };

  const shownBanner = bannerPreview ?? banner;
  const shownAvatar = avatarPreview ?? user?.avatar ?? null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        setCropping(null);
        onClose();
      }}
      title={
        cropping
          ? cropping.kind === "avatar"
            ? "프로필 사진 조정"
            : "배경 이미지 조정"
          : "프로필 편집"
      }
      size="lg"
    >
      {cropping ? (
        <ImageCropper
          key={cropping.file.name + cropping.file.lastModified}
          file={cropping.file}
          spec={cropping.kind === "avatar" ? AVATAR_CROP : BANNER_CROP}
          onCancel={() => setCropping(null)}
          onConfirm={(cropped) => {
            const kind = cropping.kind;
            setCropping(null);
            void upload(cropped, kind);
          }}
        />
      ) : (
        <div className="space-y-5">
          {/* 배경 + 아바타 — 누르면 파일 고르기 */}
          <div className="overflow-hidden rounded-xl border border-bg-elevated/40 bg-bg-tertiary">
            <button
              type="button"
              onClick={() => bannerInput.current?.click()}
              disabled={uploading === "banner"}
              className="group relative block h-36 w-full bg-gradient-to-br from-accent-primary/30 to-accent-primary/5"
            >
              {shownBanner && (
                <Image
                  src={shownBanner}
                  alt="프로필 배경"
                  fill
                  unoptimized
                  className="object-cover"
                />
              )}
              <span className="absolute right-3 top-3 flex items-center gap-1.5 rounded-lg bg-black/60 px-3 py-1.5 text-xs font-semibold text-white">
                <Camera className="h-3.5 w-3.5" />
                {uploading === "banner" ? "올리는 중…" : "배경 변경"}
              </span>
            </button>
            <div className="flex items-end gap-3 px-4 pb-4">
              <button
                type="button"
                onClick={() => avatarInput.current?.click()}
                disabled={uploading === "avatar"}
                className="group relative -mt-10 h-20 w-20 shrink-0 overflow-hidden rounded-full border-4 border-bg-tertiary bg-bg-secondary"
                title="프로필 사진 변경"
              >
                {shownAvatar ? (
                  <Image
                    src={shownAvatar}
                    alt="프로필 사진"
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <User className="mx-auto mt-4 h-9 w-9 text-text-tertiary" />
                )}
                <span className="absolute inset-0 flex items-center justify-center bg-black/50 text-xs font-semibold text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {uploading === "avatar" ? "올리는 중…" : "변경"}
                </span>
              </button>
              <p className="pb-1 text-xs text-text-tertiary">
                사진·배경은 고른 뒤 위치·크기를 맞춰 올립니다 · jpg, png, gif,
                webp
              </p>
            </div>
            <input
              ref={avatarInput}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0], "avatar")}
            />
            <input
              ref={bannerInput}
              type="file"
              accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
              className="hidden"
              onChange={(e) => pick(e.target.files?.[0], "banner")}
            />
          </div>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
              닉네임
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
              소개
            </span>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="자기소개를 입력하세요"
              className="w-full resize-none rounded-lg border border-bg-elevated bg-bg-tertiary px-3 py-2 text-sm text-text-primary outline-none focus:border-accent-primary"
            />
          </label>

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              닫기
            </Button>
            <Button
              onClick={save}
              disabled={!dirty || saving}
              isLoading={saving}
            >
              저장
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
