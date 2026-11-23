"use client";

/**
 * 내 프로필 편집 창 — 닉네임·소개·프로필 사진·배경 이미지.
 *
 * 2026-11 게임 계정 관리 화면을 내 프로필로 합치면서, 그 화면 머리에 있던 편집 기능을
 * 창 하나로 옮겼다. 사진·배경은 고른 뒤 조정 화면(ImageCropper)에서 위치·크기를 맞춰 올리고,
 * 닉네임·소개는 "저장"을 눌러야 반영된다. 올리는 파일은 서버 규칙대로 5MB 이하.
 *
 * 프로필 배경은 「올린 이미지」와 「가진 배경 장식」 중 하나를 고른다(Task 22). 고르면 바로
 * 적용된다 — 장식을 고르면 PROFILE_BANNER 자리에 장착, 올린 이미지를 고르면 장식을 해제한다.
 * 상점·보관함의 장착과 같은 상태라 어디서 바꿔도 결과가 같다. 올린 이미지는 지우지 않는다.
 */

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { Camera, User } from "lucide-react";
import { userApi } from "@/lib/api-client";
import { getApiErrorMessage } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { AVATAR_CROP, BANNER_CROP, ImageCropper } from "./ImageCropper";
import { Button, Modal } from "@/components/ui";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ImageIcon } from "lucide-react";
import { shopApi } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { useCosmeticCatalog } from "@/components/cosmetics/catalog";
import { LiveBanner } from "@/components/cosmetics/live-banner";
import { NameTintPicker } from "@/components/cosmetics/NameTintPicker";
import { applyLoadout } from "@/components/cosmetics/medal-sync";
import {
  LOADOUT_QUERY_KEY,
  useCosmeticLoadouts,
} from "@/components/cosmetics/useCosmeticLoadouts";
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
  const queryClient = useQueryClient();
  const { addToast } = useToast();
  // 프로필 배경 고르기 — 가진 배경 장식 목록과 지금 장착 상태
  const loadouts = useCosmeticLoadouts([user?.id]);
  const equippedBanner = user?.id
    ? (loadouts[user.id]?.PROFILE_BANNER ?? null)
    : null;
  const { data: shop } = useQuery({
    queryKey: ["shop"],
    queryFn: shopApi.getShop,
    enabled: isOpen && Boolean(user?.id),
  });
  // 코드 상품 + 관리자가 추가한 상품
  const allCosmetics = useCosmeticCatalog();
  // 장착한 닉네임 글꼴 — 있으면 아래에서 색을 바꿀 수 있다
  const equippedName = shop?.items.find(
    (it) => it.slot === "NAME_STYLE" && it.equipped,
  );
  const ownedBanners = allCosmetics.filter(
    (item) =>
      item.slot === "PROFILE_BANNER" &&
      item.liveBanner &&
      shop?.items.some((it) => it.code === item.code && it.owned),
  );
  // 누른 쪽을 바로 표시한다(서버 응답 전) — 실패하면 되돌린다
  const [pendingBanner, setPendingBanner] = useState<string | null | undefined>(
    undefined,
  );
  const chosenBanner =
    pendingBanner === undefined ? equippedBanner : pendingBanner;
  // 요청이 끝나기 전에 다른 배경을 누르면 두 요청이 엇갈려 앞의 것이 남곤 했다 —
  // 마지막으로 누른 것만 보낸다(보내는 중에 누르면 끝난 뒤 그것을 이어서 보낸다)
  const bannerBusy = useRef(false);
  const bannerNext = useRef<string | null | undefined>(undefined);
  const chooseBanner = async (code: string | null) => {
    if (code === chosenBanner) return;
    setPendingBanner(code);
    if (bannerBusy.current) {
      bannerNext.current = code;
      return;
    }
    bannerBusy.current = true;
    let target: string | null | undefined = code;
    try {
      while (target !== undefined) {
        bannerNext.current = undefined;
        const loadout = await shopApi.equip("PROFILE_BANNER", target);
        // 서버가 돌려준 장착 상태를 바로 넣는다(상점 진열·로비·프로필)
        applyLoadout(queryClient, loadout);
        queryClient.setQueryData(
          [LOADOUT_QUERY_KEY, user?.id ?? ""],
          (old: Record<string, unknown> | undefined) =>
            user?.id ? { ...(old ?? {}), [user.id]: loadout } : old,
        );
        target = bannerNext.current;
      }
    } catch {
      addToast("배경을 바꾸지 못했어요. 다시 시도해 주세요.", "error");
    } finally {
      bannerBusy.current = false;
      bannerNext.current = undefined;
      setPendingBanner(undefined);
    }
  };
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

          {/* 프로필 배경 — 올린 이미지 / 가진 배경 장식 중 하나 */}
          <div>
            <div className="mb-2 flex items-baseline justify-between">
              <span className="text-xs font-semibold text-text-secondary">
                프로필 배경
              </span>
              <Link
                href="/shop"
                onClick={onClose}
                className="text-xs font-semibold text-text-tertiary hover:text-text-secondary"
              >
                {ownedBanners.length > 0
                  ? "더 많은 배경 → 상점"
                  : "배경 장식 보러 가기 → 상점"}
              </Link>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* 올린 이미지 (없으면 기본 배경) */}
              <BannerChoice
                label={shownBanner ? "올린 이미지" : "기본 배경"}
                selected={chosenBanner === null}
                onClick={() => void chooseBanner(null)}
              >
                {shownBanner ? (
                  <Image
                    src={shownBanner}
                    alt=""
                    fill
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-primary/30 to-accent-primary/5">
                    <ImageIcon className="h-5 w-5 text-text-tertiary" />
                  </div>
                )}
              </BannerChoice>
              {/* 가진 배경 장식 — 움직이는 모습 그대로 */}
              {ownedBanners.map((item) => (
                <BannerChoice
                  key={item.code}
                  label={item.name}
                  selected={chosenBanner === item.code}
                  onClick={() => void chooseBanner(item.code)}
                >
                  <LiveBanner code={item.liveBanner!} />
                </BannerChoice>
              ))}
            </div>
            {chosenBanner !== null && (
              <p className="mt-1.5 text-xs text-text-tertiary">
                배경 장식을 쓰는 동안에도 올린 이미지는 지워지지 않아요.
              </p>
            )}
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
          {/* 닉네임 색 — 장착한 닉네임 글꼴의 색을 언제든 바꾼다(바로 적용, 저장 버튼과 따로) */}
          {equippedName && user && (
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-text-secondary">
                닉네임 색
              </span>
              <NameTintPicker
                code={equippedName.code}
                tint={equippedName.tint}
                username={username.trim() || user.username}
              />
            </div>
          )}
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

/** 프로필 배경 고르기 한 칸 — 배너 비율 썸네일 + 이름, 고른 칸은 테두리와 체크 */
function BannerChoice({
  label,
  selected,
  onClick,
  children,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={cn(
        "overflow-hidden rounded-lg text-left ring-2 transition-colors",
        selected
          ? "ring-accent-primary"
          : "ring-transparent hover:ring-bg-elevated",
      )}
    >
      <div className="relative aspect-[12/5] w-full overflow-hidden bg-bg-tertiary">
        {children}
        {selected && (
          <span className="absolute right-1.5 top-1.5 rounded-full bg-accent-primary p-0.5 text-accent-on">
            <Check className="h-3 w-3" strokeWidth={3} />
          </span>
        )}
      </div>
      <div
        className={cn(
          "bg-bg-tertiary/60 px-2 py-1 text-xs font-semibold",
          selected ? "text-text-primary" : "text-text-secondary",
        )}
      >
        {label}
      </div>
    </button>
  );
}
