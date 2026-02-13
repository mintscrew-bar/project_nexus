"use client";

import {
  useState,
  useEffect,
  useRef,
  useCallback,
  type DragEvent,
} from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  X,
  Search,
  UserPlus,
  Users,
  ChevronDown,
  ChevronRight,
  MessageCircle,
  User,
  Tag,
  FileText,
  FolderOpen,
  FolderPlus,
  Trash2,
  ExternalLink,
  Edit3,
  Plus,
  Check,
  Clock,
  UserCheck,
  Sword,
} from "lucide-react";
import { statsApi, friendApi } from "@/lib/api-client";
import { useFriendStore, type Friendship, type FriendCategory } from "@/stores/friend-store";
import { usePresenceStore } from "@/stores/presence-store";
import { useLobbyStore } from "@/stores/lobby-store";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/ui/Toast";
import { StatusIndicator } from "@/components/ui";

// ─── Types ────────────────────────────────────────────────────────────────────
type ModalState =
  | { type: "nickname"; friendship: Friendship }
  | { type: "memo"; friendship: Friendship }
  | { type: "category"; friendship: Friendship }
  | { type: "addCategory" }
  | { type: "addFriend" }
  | { type: "joinRoom"; roomId: string; roomName: string; isPrivate: boolean };

interface CtxState {
  x: number;
  y: number;
  friendship: Friendship;
  friendId: string;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────
function ContextMenu({
  ctx,
  onClose,
  onProfile,
  onNickname,
  onMemo,
  onCategory,
  onRemove,
  onInvite,
  onJoin,
}: {
  ctx: CtxState;
  onClose: () => void;
  onProfile: () => void;
  onNickname: () => void;
  onMemo: () => void;
  onCategory: () => void;
  onRemove: () => void;
  onInvite: (() => void) | null;
  onJoin: (() => void) | null;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", down);
      document.removeEventListener("keydown", key);
    };
  }, [onClose]);

  // Clamp to viewport
  const [pos, setPos] = useState({ left: ctx.x, top: ctx.y });
  useEffect(() => {
    if (!ref.current) return;
    const { width, height } = ref.current.getBoundingClientRect();
    setPos({
      left: Math.min(ctx.x, window.innerWidth - width - 8),
      top: Math.min(ctx.y, window.innerHeight - height - 8),
    });
  }, [ctx.x, ctx.y]);

  const Item = ({
    icon: Icon,
    label,
    onClick,
    danger = false,
  }: {
    icon: React.ElementType;
    label: string;
    onClick: () => void;
    danger?: boolean;
  }) => (
    <button
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors text-left hover:bg-bg-elevated ${
        danger ? "text-accent-danger" : "text-text-primary"
      }`}
      onClick={() => { onClick(); onClose(); }}
    >
      <Icon className="w-4 h-4 flex-shrink-0 text-text-tertiary" />
      {label}
    </button>
  );

  return (
    <div
      ref={ref}
      style={{ position: "fixed", left: pos.left, top: pos.top, zIndex: 9999 }}
      className="bg-bg-secondary border border-bg-tertiary rounded-lg shadow-2xl min-w-[180px] py-1 overflow-hidden"
    >
      <Item icon={User} label="프로필 보기" onClick={onProfile} />
      <div className="border-t border-bg-tertiary my-1" />
      <Item icon={Tag} label="별명 설정" onClick={onNickname} />
      <Item icon={FileText} label="메모" onClick={onMemo} />
      <Item icon={FolderOpen} label="카테고리 변경" onClick={onCategory} />
      {(onInvite || onJoin) && <div className="border-t border-bg-tertiary my-1" />}
      {onInvite && <Item icon={Sword} label="내전 초대하기" onClick={onInvite} />}
      {onJoin && <Item icon={ExternalLink} label="내전 참가하기" onClick={onJoin} />}
      <div className="border-t border-bg-tertiary my-1" />
      <Item icon={Trash2} label="친구 삭제" onClick={onRemove} danger />
    </div>
  );
}

// ─── Hover Tooltip ────────────────────────────────────────────────────────────
function HoverTooltip({
  friendship,
  friendId,
  username,
}: {
  friendship: Friendship;
  friendId: string;
  username: string; // display name (nickname or real)
}) {
  const getFriendStatus = usePresenceStore((s) => s.getFriendStatus);
  const getMeta = useFriendStore((s) => s.getMeta);
  const meta = getMeta(friendId);
  const status = getFriendStatus(friendId);

  return (
    <div
      className="absolute right-full mr-2 top-0 z-50 bg-bg-secondary border border-bg-tertiary rounded-xl shadow-2xl p-3 w-52 pointer-events-none"
      style={{ minWidth: 200 }}
    >
      <div className="flex items-center gap-3 mb-2">
        <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
          {friendship.user.avatar || friendship.friend.avatar ? (
            <Image
              src={(friendship.friend?.avatar || friendship.user.avatar)!}
              alt={username}
              fill
              className="object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Users className="w-5 h-5 text-text-tertiary" />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-text-primary text-sm truncate">{username}</p>
          {meta.nickname && (
            <p className="text-xs text-text-tertiary truncate">({friendship.friend?.username || friendship.user.username})</p>
          )}
        </div>
      </div>
      <StatusIndicator
        status={status?.status || "OFFLINE"}
        size="sm"
        showLabel
      />
      {meta.memo && (
        <p className="mt-2 text-xs text-text-secondary bg-bg-tertiary/60 rounded p-1.5 line-clamp-2">
          {meta.memo}
        </p>
      )}
    </div>
  );
}

// ─── Friend Item ─────────────────────────────────────────────────────────────
function FriendItem({
  friendship,
  currentUserId,
  onContextMenu,
  dragging,
  dragOver,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}: {
  friendship: Friendship;
  currentUserId: string;
  onContextMenu: (e: React.MouseEvent, f: Friendship) => void;
  dragging: boolean;
  dragOver: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOver: (e: DragEvent) => void;
  onDrop: (e: DragEvent) => void;
}) {
  const router = useRouter();
  const { addToast } = useToast();
  const getDisplayName = useFriendStore((s) => s.getDisplayName);
  const getFriendStatus = usePresenceStore((s) => s.getFriendStatus);

  const friendUser =
    friendship.userId === currentUserId ? friendship.friend : friendship.user;
  const displayName = getDisplayName(friendUser.id, friendUser.username);
  const status = getFriendStatus(friendUser.id);
  const [hovered, setHovered] = useState(false);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  const handleMouseEnter = () => {
    hoverTimer.current = setTimeout(() => setHovered(true), 400);
  };
  const handleMouseLeave = () => {
    clearTimeout(hoverTimer.current);
    setHovered(false);
  };

  return (
    <div
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; onDragStart(); }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, friendship); }}
      onClick={() => {
        addToast("DM 기능 준비 중입니다.", "info");
      }}
      className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors group select-none
        ${dragging ? "opacity-40" : ""}
        ${dragOver ? "bg-accent-primary/10 border border-dashed border-accent-primary/40" : "hover:bg-bg-elevated"}
      `}
    >
      {/* Avatar */}
      <div className="relative flex-shrink-0">
        <div className="w-8 h-8 rounded-full bg-bg-tertiary overflow-hidden">
          {friendUser.avatar ? (
            <Image
              src={friendUser.avatar}
              alt={displayName}
              width={32}
              height={32}
              className="w-full h-full object-cover"
              unoptimized
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-4 h-4 text-text-tertiary" />
            </div>
          )}
        </div>
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-bg-secondary
            ${status?.status === "ONLINE" ? "bg-accent-success" : status?.status === "AWAY" ? "bg-accent-gold" : "bg-text-tertiary/40"}
          `}
        />
      </div>

      {/* Name */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-text-primary truncate">{displayName}</p>
        <p className="text-xs text-text-tertiary truncate">
          {status?.status === "ONLINE" ? "온라인" : status?.status === "AWAY" ? "자리비움" : "오프라인"}
        </p>
      </div>

      {/* Hover action button */}
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-bg-tertiary"
        onClick={(e) => {
          e.stopPropagation();
          router.push(`/profile/${friendUser.id}`);
        }}
        title="프로필"
      >
        <ExternalLink className="w-3.5 h-3.5 text-text-tertiary" />
      </button>

      {/* Hover tooltip */}
      {hovered && (
        <HoverTooltip friendship={friendship} friendId={friendUser.id} username={displayName} />
      )}
    </div>
  );
}

// ─── Category Section ─────────────────────────────────────────────────────────
function CategorySection({
  label,
  categoryId,
  friends,
  currentUserId,
  onContextMenu,
  dragFriendId,
  dragOverCategoryId,
  setDragFriendId,
  setDragOverCategoryId,
  onDropToCategory,
  canRename,
  canDelete,
  onRename,
  onDelete,
}: {
  label: string;
  categoryId: string | null;
  friends: Friendship[];
  currentUserId: string;
  onContextMenu: (e: React.MouseEvent, f: Friendship) => void;
  dragFriendId: string | null;
  dragOverCategoryId: string | null;
  setDragFriendId: (id: string | null) => void;
  setDragOverCategoryId: (id: string | null) => void;
  onDropToCategory: (friendId: string, categoryId: string | null) => void;
  canRename: boolean;
  canDelete: boolean;
  onRename?: () => void;
  onDelete?: () => void;
}) {
  const { toggleCategoryCollapse, categories } = useFriendStore();
  const getFriendStatus = usePresenceStore((s) => s.getFriendStatus);
  const cat = categories.find((c) => c.id === categoryId);
  const isCollapsed = cat?.isCollapsed ?? false;
  const [editingName, setEditingName] = useState(false);

  const sectionDragOver = dragOverCategoryId === (categoryId ?? "uncategorized");

  // 온라인 친구 수 계산
  const onlineCount = friends.filter((f) => {
    const friendUser = f.userId === currentUserId ? f.friend : f.user;
    const status = getFriendStatus(friendUser.id);
    return status?.status === "ONLINE" || status?.status === "AWAY";
  }).length;

  return (
    <div className={`mb-1 transition-colors ${sectionDragOver ? "bg-accent-primary/5 rounded-lg" : ""}`}>
      {/* Header */}
      <div
        className="flex items-center gap-1 px-2 py-1 group"
        onDragOver={(e) => {
          e.preventDefault();
          setDragOverCategoryId(categoryId ?? "uncategorized");
        }}
        onDrop={(e) => {
          e.preventDefault();
          if (dragFriendId) onDropToCategory(dragFriendId, categoryId);
          setDragOverCategoryId(null);
        }}
        onDragLeave={() => setDragOverCategoryId(null)}
      >
        <button
          className="flex items-center gap-1 flex-1 min-w-0"
          onClick={() => categoryId && toggleCategoryCollapse(categoryId)}
        >
          {isCollapsed ? (
            <ChevronRight className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          ) : (
            <ChevronDown className="w-3.5 h-3.5 text-text-tertiary flex-shrink-0" />
          )}
          <span className="text-xs font-semibold text-text-tertiary uppercase tracking-wider truncate">
            {label}{" "}
            <span className="normal-case tracking-normal">
              (<span className={onlineCount > 0 ? "text-accent-success" : ""}>{onlineCount}</span>/{friends.length})
            </span>
          </span>
        </button>
        {canRename && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-elevated transition-opacity"
            onClick={onRename}
            title="이름 변경"
          >
            <Edit3 className="w-3 h-3 text-text-tertiary" />
          </button>
        )}
        {canDelete && (
          <button
            className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-bg-elevated transition-opacity"
            onClick={onDelete}
            title="카테고리 삭제"
          >
            <Trash2 className="w-3 h-3 text-text-tertiary" />
          </button>
        )}
      </div>

      {/* Friends */}
      {!isCollapsed && (
        <div className="space-y-0.5 px-1">
          {friends.map((f) => {
            const friendUser = f.userId === currentUserId ? f.friend : f.user;
            return (
              <FriendItem
                key={f.id}
                friendship={f}
                currentUserId={currentUserId}
                onContextMenu={onContextMenu}
                dragging={dragFriendId === friendUser.id}
                dragOver={false}
                onDragStart={() => setDragFriendId(friendUser.id)}
                onDragEnd={() => { setDragFriendId(null); setDragOverCategoryId(null); }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOverCategoryId(categoryId ?? "uncategorized");
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (dragFriendId) onDropToCategory(dragFriendId, categoryId);
                  setDragFriendId(null);
                  setDragOverCategoryId(null);
                }}
              />
            );
          })}
          {friends.length === 0 && (
            <p className="text-xs text-text-tertiary px-2 py-1 italic">비어있음 — 친구를 드래그하여 추가</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Inline Modals ────────────────────────────────────────────────────────────
function InlineModal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-[9998] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative z-10 bg-bg-secondary border border-bg-tertiary rounded-xl shadow-2xl w-80 p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-text-primary text-sm">{title}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-bg-elevated">
            <X className="w-4 h-4 text-text-tertiary" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NicknameModal({ friendship, friendId, onClose }: { friendship: Friendship; friendId: string; onClose: () => void }) {
  const { setNickname, getMeta, getDisplayName } = useFriendStore();
  const friendUser = friendship.friend ?? friendship.user;
  const currentNickname = getMeta(friendId).nickname ?? "";
  const [value, setValue] = useState(currentNickname);

  const handleSave = () => {
    setNickname(friendId, value.trim());
    onClose();
  };

  return (
    <InlineModal title={`별명 설정 — ${friendUser.username}`} onClose={onClose}>
      <p className="text-xs text-text-tertiary mb-2">나에게만 표시되는 별명입니다.</p>
      <input
        autoFocus
        className="w-full input text-sm mb-3"
        placeholder={friendUser.username}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        maxLength={20}
      />
      <div className="flex gap-2 justify-end">
        <button className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-elevated rounded-lg" onClick={onClose}>취소</button>
        <button className="px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-hover" onClick={handleSave}>저장</button>
      </div>
    </InlineModal>
  );
}

function MemoModal({ friendship, friendId, onClose }: { friendship: Friendship; friendId: string; onClose: () => void }) {
  const { setMemo, getMeta } = useFriendStore();
  const friendUser = friendship.friend ?? friendship.user;
  const current = getMeta(friendId).memo ?? "";
  const [value, setValue] = useState(current);

  const handleSave = () => {
    setMemo(friendId, value.trim());
    onClose();
  };

  return (
    <InlineModal title={`메모 — ${friendUser.username}`} onClose={onClose}>
      <p className="text-xs text-text-tertiary mb-2">나만 볼 수 있는 메모입니다.</p>
      <textarea
        autoFocus
        className="w-full input text-sm mb-3 resize-none h-24"
        placeholder="메모를 입력하세요..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={200}
      />
      <p className="text-xs text-text-tertiary text-right mb-2">{value.length}/200</p>
      <div className="flex gap-2 justify-end">
        <button className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-elevated rounded-lg" onClick={onClose}>취소</button>
        <button className="px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-hover" onClick={handleSave}>저장</button>
      </div>
    </InlineModal>
  );
}

function CategoryPickerModal({ friendship, friendId, onClose }: { friendship: Friendship; friendId: string; onClose: () => void }) {
  const { categories, setFriendCategory, getMeta, addCategory } = useFriendStore();
  const current = getMeta(friendId).categoryId;
  const [newCatName, setNewCatName] = useState("");
  const [showNew, setShowNew] = useState(false);

  const friendUser = friendship.friend ?? friendship.user;

  const handlePick = (catId: string | null) => {
    setFriendCategory(friendId, catId);
    onClose();
  };

  const handleNewCat = () => {
    if (!newCatName.trim()) return;
    const id = addCategory(newCatName.trim());
    setFriendCategory(friendId, id);
    onClose();
  };

  return (
    <InlineModal title={`카테고리 변경 — ${friendUser.username}`} onClose={onClose}>
      <div className="space-y-1 mb-3">
        <button
          className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${!current ? "bg-accent-primary/10 text-accent-primary" : "hover:bg-bg-elevated text-text-primary"}`}
          onClick={() => handlePick(null)}
        >
          미분류
          {!current && <Check className="w-4 h-4" />}
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center justify-between ${current === cat.id ? "bg-accent-primary/10 text-accent-primary" : "hover:bg-bg-elevated text-text-primary"}`}
            onClick={() => handlePick(cat.id)}
          >
            {cat.name}
            {current === cat.id && <Check className="w-4 h-4" />}
          </button>
        ))}
      </div>
      {showNew ? (
        <div className="flex gap-2">
          <input
            autoFocus
            className="flex-1 input text-sm"
            placeholder="새 카테고리 이름"
            value={newCatName}
            onChange={(e) => setNewCatName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleNewCat(); }}
            maxLength={20}
          />
          <button className="px-2 py-1.5 text-sm bg-accent-primary text-white rounded-lg" onClick={handleNewCat}>
            <Check className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <button
          className="w-full flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:bg-bg-elevated rounded-lg transition-colors"
          onClick={() => setShowNew(true)}
        >
          <Plus className="w-4 h-4" />
          새 카테고리 만들기
        </button>
      )}
    </InlineModal>
  );
}

function AddFriendModal({ onClose }: { onClose: () => void }) {
  const { addToast } = useToast();
  const { fetchFriends } = useFriendStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; username: string; avatar: string | null }[]>([]);
  const [searching, setSearching] = useState(false);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await statsApi.searchUsers(q.trim(), 8);
      const list = Array.isArray(data) ? data : (data?.users ?? []);
      setResults(list);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => doSearch(query), 400);
    return () => clearTimeout(searchTimer.current);
  }, [query, doSearch]);

  const handleSend = async (userId: string) => {
    try {
      await friendApi.sendRequest(userId);
      setSentIds((prev) => new Set(prev).add(userId));
      addToast("친구 요청을 보냈습니다!", "success");
      fetchFriends();
    } catch (e: any) {
      addToast(e?.response?.data?.message ?? "친구 요청에 실패했습니다.", "error");
    }
  };

  return (
    <InlineModal title="친구 추가" onClose={onClose}>
      <div className="relative mb-3">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
        <input
          autoFocus
          className="w-full input text-sm pl-8"
          placeholder="유저명으로 검색..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className="space-y-1 min-h-[60px] max-h-52 overflow-y-auto">
        {searching && (
          <div className="flex items-center justify-center py-4">
            <div className="w-4 h-4 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
          </div>
        )}
        {!searching && query.trim().length >= 2 && results.length === 0 && (
          <p className="text-sm text-text-tertiary text-center py-3">검색 결과가 없습니다.</p>
        )}
        {!searching && query.trim().length < 2 && (
          <p className="text-xs text-text-tertiary text-center py-3">두 글자 이상 입력하세요.</p>
        )}
        {!searching && results.map((u) => (
          <div key={u.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-bg-tertiary transition-colors">
            <div className="w-8 h-8 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
              {u.avatar ? (
                <Image src={u.avatar} alt={u.username} width={32} height={32} className="object-cover" unoptimized />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <User className="w-4 h-4 text-text-tertiary" />
                </div>
              )}
            </div>
            <span className="flex-1 text-sm text-text-primary truncate">{u.username}</span>
            <button
              disabled={sentIds.has(u.id)}
              onClick={() => handleSend(u.id)}
              className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors flex-shrink-0 ${
                sentIds.has(u.id)
                  ? "bg-bg-tertiary text-text-tertiary cursor-default"
                  : "bg-accent-primary text-white hover:bg-accent-hover"
              }`}
            >
              {sentIds.has(u.id) ? (
                <><Check className="w-3 h-3" /> 요청됨</>
              ) : (
                <><UserPlus className="w-3 h-3" /> 추가</>
              )}
            </button>
          </div>
        ))}
      </div>
    </InlineModal>
  );
}

function AddCategoryModal({ onClose }: { onClose: () => void }) {
  const { addCategory } = useFriendStore();
  const [name, setName] = useState("");

  const handleAdd = () => {
    if (!name.trim()) return;
    addCategory(name.trim());
    onClose();
  };

  return (
    <InlineModal title="카테고리 추가" onClose={onClose}>
      <input
        autoFocus
        className="w-full input text-sm mb-3"
        placeholder="카테고리 이름"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleAdd(); }}
        maxLength={20}
      />
      <div className="flex gap-2 justify-end">
        <button className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-elevated rounded-lg" onClick={onClose}>취소</button>
        <button className="px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-hover" onClick={handleAdd}>추가</button>
      </div>
    </InlineModal>
  );
}

function RenameCategoryModal({ categoryId, currentName, onClose }: { categoryId: string; currentName: string; onClose: () => void }) {
  const { renameCategory } = useFriendStore();
  const [name, setName] = useState(currentName);

  const handleSave = () => {
    if (!name.trim()) return;
    renameCategory(categoryId, name.trim());
    onClose();
  };

  return (
    <InlineModal title="카테고리 이름 변경" onClose={onClose}>
      <input
        autoFocus
        className="w-full input text-sm mb-3"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }}
        maxLength={20}
      />
      <div className="flex gap-2 justify-end">
        <button className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-elevated rounded-lg" onClick={onClose}>취소</button>
        <button className="px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-hover" onClick={handleSave}>저장</button>
      </div>
    </InlineModal>
  );
}

function ConfirmModal({
  title,
  message,
  confirmLabel = "삭제",
  onConfirm,
  onClose,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <InlineModal title={title} onClose={onClose}>
      <p className="text-sm text-text-secondary mb-4">{message}</p>
      <div className="flex gap-2 justify-end">
        <button
          className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-elevated rounded-lg text-text-primary transition-colors"
          onClick={onClose}
        >
          취소
        </button>
        <button
          className="px-3 py-1.5 text-sm bg-accent-danger text-white rounded-lg hover:bg-accent-danger/80 transition-colors"
          onClick={() => { onConfirm(); onClose(); }}
        >
          {confirmLabel}
        </button>
      </div>
    </InlineModal>
  );
}

function JoinRoomModal({ roomId, roomName, isPrivate, onClose }: { roomId: string; roomName: string; isPrivate: boolean; onClose: () => void }) {
  const router = useRouter();
  const { addToast } = useToast();
  const [password, setPassword] = useState("");

  const handleJoin = () => {
    if (isPrivate && !password.trim()) {
      addToast("비밀번호를 입력해주세요.", "error");
      return;
    }
    const url = `/tournaments/${roomId}/lobby${isPrivate && password ? `?password=${encodeURIComponent(password)}` : ""}`;
    router.push(url);
    onClose();
  };

  return (
    <InlineModal title={`내전 참가 — ${roomName}`} onClose={onClose}>
      {isPrivate && (
        <>
          <p className="text-xs text-text-tertiary mb-2">비공개 방입니다. 비밀번호를 입력하세요.</p>
          <input
            autoFocus
            type="password"
            className="w-full input text-sm mb-3"
            placeholder="비밀번호"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleJoin(); }}
          />
        </>
      )}
      <div className="flex gap-2 justify-end">
        <button className="px-3 py-1.5 text-sm bg-bg-tertiary hover:bg-bg-elevated rounded-lg" onClick={onClose}>취소</button>
        <button className="px-3 py-1.5 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-hover" onClick={handleJoin}>참가</button>
      </div>
    </InlineModal>
  );
}

// ─── Pending List ─────────────────────────────────────────────────────────────
function PendingList({ currentUserId }: { currentUserId: string }) {
  const { pendingRequests, acceptRequest, rejectRequest } = useFriendStore();
  const { addToast } = useToast();

  const incoming = pendingRequests.filter((r) => r.friendId === currentUserId);
  const outgoing = pendingRequests.filter((r) => r.userId === currentUserId);

  const handleAccept = async (id: string) => {
    try { await acceptRequest(id); addToast("친구 요청을 수락했습니다!", "success"); }
    catch { addToast("수락 실패", "error"); }
  };

  const handleReject = async (id: string) => {
    try { await rejectRequest(id); addToast("친구 요청을 거절했습니다.", "info"); }
    catch { addToast("거절 실패", "error"); }
  };

  const UserRow = ({ user, avatar, action }: { user: { id: string; username: string; avatar: string | null }; avatar: string | null; action: React.ReactNode }) => (
    <div className="flex items-center gap-2.5 px-3 py-2 rounded-lg hover:bg-bg-elevated transition-colors">
      <div className="w-8 h-8 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
        {avatar ? (
          <Image src={avatar} alt={user.username} width={32} height={32} className="object-cover" unoptimized />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <User className="w-4 h-4 text-text-tertiary" />
          </div>
        )}
      </div>
      <span className="flex-1 text-sm font-medium text-text-primary truncate">{user.username}</span>
      {action}
    </div>
  );

  if (incoming.length === 0 && outgoing.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center flex-1 text-center p-6">
        <Clock className="w-8 h-8 text-text-tertiary mb-2" />
        <p className="text-sm text-text-secondary">대기 중인 친구 요청이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-2 space-y-4">
      {incoming.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-1">
            받은 요청 ({incoming.length})
          </p>
          {incoming.map((r) => (
            <UserRow
              key={r.id}
              user={r.user}
              avatar={r.user.avatar}
              action={
                <div className="flex gap-1">
                  <button className="px-2 py-1 text-xs bg-accent-primary text-white rounded-md hover:bg-accent-hover" onClick={() => handleAccept(r.id)}>수락</button>
                  <button className="px-2 py-1 text-xs bg-bg-tertiary hover:bg-bg-elevated text-text-secondary rounded-md" onClick={() => handleReject(r.id)}>거절</button>
                </div>
              }
            />
          ))}
        </div>
      )}
      {outgoing.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-text-tertiary uppercase tracking-wider px-2 mb-1">
            보낸 요청 ({outgoing.length})
          </p>
          {outgoing.map((r) => (
            <UserRow
              key={r.id}
              user={r.friend}
              avatar={r.friend.avatar}
              action={<span className="text-xs text-text-tertiary">대기 중</span>}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────
export function FriendsPanel() {
  const router = useRouter();
  const { addToast } = useToast();
  const { user, isAuthenticated } = useAuthStore();
  const {
    isOpen,
    closePanel,
    friends,
    pendingRequests,
    categories,
    isLoading,
    fetchFriends,
    removeFriend,
    deleteCategory,
    setFriendCategory,
    getMeta,
    getDisplayName,
  } = useFriendStore();
  const getFriendStatus = usePresenceStore((s) => s.getFriendStatus);
  const room = useLobbyStore((s) => s.room);

  const [tab, setTab] = useState<"friends" | "pending">("friends");
  const [search, setSearch] = useState("");
  const [ctx, setCtx] = useState<CtxState | null>(null);
  const [modal, setModal] = useState<ModalState | null>(null);
  const [dragFriendId, setDragFriendId] = useState<string | null>(null);
  const [dragOverCategoryId, setDragOverCategoryId] = useState<string | null>(null);
  const [renameCat, setRenameCat] = useState<{ id: string; name: string } | null>(null);
  const [confirmState, setConfirmState] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  // Load friends when panel opens
  useEffect(() => {
    if (isOpen && isAuthenticated) fetchFriends();
  }, [isOpen, isAuthenticated, fetchFriends]);

  const currentUserId = user?.id ?? "";

  const getFriendUser = useCallback(
    (f: Friendship) => (f.userId === currentUserId ? f.friend : f.user),
    [currentUserId]
  );

  // Filter friends by search
  const filteredFriends = friends.filter((f) => {
    const fu = getFriendUser(f);
    const display = getDisplayName(fu.id, fu.username);
    const q = search.toLowerCase();
    return display.toLowerCase().includes(q) || fu.username.toLowerCase().includes(q);
  });

  // Group into categories
  const friendsByCategory = useCallback(() => {
    const byCat: Record<string, Friendship[]> = {};
    const uncategorized: Friendship[] = [];
    for (const f of filteredFriends) {
      const fu = getFriendUser(f);
      const meta = getMeta(fu.id);
      const catId = meta.categoryId;
      if (catId) {
        if (!byCat[catId]) byCat[catId] = [];
        byCat[catId].push(f);
      } else {
        uncategorized.push(f);
      }
    }
    return { byCat, uncategorized };
  }, [filteredFriends, getFriendUser, getMeta]);

  const { byCat, uncategorized } = friendsByCategory();

  const incomingCount = pendingRequests.filter((r) => r.friendId === currentUserId).length;

  const handleContextMenu = (e: React.MouseEvent, f: Friendship) => {
    e.preventDefault();
    const fu = getFriendUser(f);
    setCtx({ x: e.clientX, y: e.clientY, friendship: f, friendId: fu.id });
  };

  const handleRemove = (friendship: Friendship) => {
    const fu = getFriendUser(friendship);
    setConfirmState({
      title: "친구 삭제",
      message: `${fu.username}님을 친구 목록에서 삭제하시겠습니까?`,
      onConfirm: async () => {
        try {
          await removeFriend(friendship.id);
          addToast("친구를 삭제했습니다.", "info");
        } catch {
          addToast("친구 삭제에 실패했습니다.", "error");
        }
      },
    });
  };

  const handleInviteToRoom = () => {
    if (!room) return;
    const url = `${window.location.origin}/tournaments/${room.id}/lobby`;
    navigator.clipboard.writeText(url);
    addToast("내전 초대 링크가 복사되었습니다!", "success");
  };

  const handleDropToCategory = (friendId: string, categoryId: string | null) => {
    setFriendCategory(friendId, categoryId);
  };

  // Can invite: in a room with space and status WAITING
  const canInvite =
    !!room && room.status === "WAITING" &&
    room.participants.length < room.maxParticipants;

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div className="fixed inset-0 z-40" onClick={closePanel} />
      )}

      {/* Slide-in Panel */}
      <div
        className={`fixed top-0 right-0 h-full w-72 bg-bg-secondary border-l border-bg-tertiary z-50 flex flex-col shadow-2xl transition-transform duration-300 ease-in-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-accent-primary" />
            <span className="font-semibold text-text-primary text-sm">친구 목록</span>
          </div>
          <div className="flex items-center gap-1">
            {/* Add Friend */}
            <button
              title="친구 추가"
              onClick={() => setModal({ type: "addFriend" })}
              className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-tertiary hover:text-accent-primary transition-colors"
            >
              <UserPlus className="w-4 h-4" />
            </button>
            {/* Add Category */}
            <button
              title="카테고리 추가"
              onClick={() => setModal({ type: "addCategory" })}
              className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            >
              <FolderPlus className="w-4 h-4" />
            </button>
            <button
              onClick={closePanel}
              className="p-1.5 rounded-lg hover:bg-bg-elevated text-text-tertiary hover:text-text-primary transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Search */}
        {tab === "friends" && (
          <div className="px-3 py-2 border-b border-bg-tertiary">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary" />
              <input
                className="w-full bg-bg-tertiary/60 rounded-lg pl-8 pr-3 py-1.5 text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary/50"
                placeholder="친구 검색..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex border-b border-bg-tertiary">
          <button
            className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              tab === "friends"
                ? "text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5"
                : "text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => setTab("friends")}
          >
            <UserCheck className="w-3.5 h-3.5" />
            친구 {friends.length > 0 && `(${friends.length})`}
          </button>
          <button
            className={`flex-1 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
              tab === "pending"
                ? "text-accent-primary border-b-2 border-accent-primary bg-accent-primary/5"
                : "text-text-secondary hover:text-text-primary"
            }`}
            onClick={() => setTab("pending")}
          >
            <Clock className="w-3.5 h-3.5" />
            대기 중
            {incomingCount > 0 && (
              <span className="bg-accent-danger text-white text-[10px] px-1.5 py-0.5 rounded-full leading-none">
                {incomingCount}
              </span>
            )}
          </button>
        </div>

        {/* Content */}
        {tab === "friends" ? (
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-accent-primary/30 border-t-accent-primary rounded-full animate-spin" />
              </div>
            ) : friends.length === 0 && categories.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center">
                <Users className="w-8 h-8 text-text-tertiary mb-2" />
                <p className="text-sm text-text-secondary">친구가 없습니다.</p>
              </div>
            ) : (
              <>
                {/* Custom categories */}
                {categories.map((cat) => (
                  <CategorySection
                    key={cat.id}
                    label={cat.name}
                    categoryId={cat.id}
                    friends={byCat[cat.id] ?? []}
                    currentUserId={currentUserId}
                    onContextMenu={handleContextMenu}
                    dragFriendId={dragFriendId}
                    dragOverCategoryId={dragOverCategoryId}
                    setDragFriendId={setDragFriendId}
                    setDragOverCategoryId={setDragOverCategoryId}
                    onDropToCategory={handleDropToCategory}
                    canRename
                    canDelete
                    onRename={() => setRenameCat({ id: cat.id, name: cat.name })}
                    onDelete={() => {
                      setConfirmState({
                        title: "카테고리 삭제",
                        message: `"${cat.name}" 카테고리를 삭제하시겠습니까? 포함된 친구들은 미분류로 이동됩니다.`,
                        onConfirm: () => deleteCategory(cat.id),
                      });
                    }}
                  />
                ))}

                {/* Uncategorized */}
                {(uncategorized.length > 0 || categories.length === 0) && (
                  <CategorySection
                    label="전체"
                    categoryId={null}
                    friends={uncategorized}
                    currentUserId={currentUserId}
                    onContextMenu={handleContextMenu}
                    dragFriendId={dragFriendId}
                    dragOverCategoryId={dragOverCategoryId}
                    setDragFriendId={setDragFriendId}
                    setDragOverCategoryId={setDragOverCategoryId}
                    onDropToCategory={handleDropToCategory}
                    canRename={false}
                    canDelete={false}
                  />
                )}
              </>
            )}
          </div>
        ) : (
          <PendingList currentUserId={currentUserId} />
        )}
      </div>

      {/* Context Menu */}
      {ctx && (
        <ContextMenu
          ctx={ctx}
          onClose={() => setCtx(null)}
          onProfile={() => {
            router.push(`/profile/${ctx.friendId}`);
          }}
          onNickname={() => setModal({ type: "nickname", friendship: ctx.friendship })}
          onMemo={() => setModal({ type: "memo", friendship: ctx.friendship })}
          onCategory={() => setModal({ type: "category", friendship: ctx.friendship })}
          onRemove={() => handleRemove(ctx.friendship)}
          onInvite={canInvite ? handleInviteToRoom : null}
          onJoin={(() => {
            const status = getFriendStatus(ctx.friendId) as any;
            if (!status?.currentRoomId) return null;
            return () => setModal({
              type: "joinRoom",
              roomId: status.currentRoomId,
              roomName: status.currentRoomName ?? "친구의 방",
              isPrivate: status.currentRoomIsPrivate ?? false,
            });
          })()}
        />
      )}

      {/* Modals */}
      {modal?.type === "nickname" && (
        <NicknameModal
          friendship={modal.friendship}
          friendId={getFriendUser(modal.friendship).id}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "memo" && (
        <MemoModal
          friendship={modal.friendship}
          friendId={getFriendUser(modal.friendship).id}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "category" && (
        <CategoryPickerModal
          friendship={modal.friendship}
          friendId={getFriendUser(modal.friendship).id}
          onClose={() => setModal(null)}
        />
      )}
      {modal?.type === "addFriend" && (
        <AddFriendModal onClose={() => setModal(null)} />
      )}
      {modal?.type === "addCategory" && (
        <AddCategoryModal onClose={() => setModal(null)} />
      )}
      {modal?.type === "joinRoom" && (
        <JoinRoomModal
          roomId={modal.roomId}
          roomName={modal.roomName}
          isPrivate={modal.isPrivate}
          onClose={() => setModal(null)}
        />
      )}
      {renameCat && (
        <RenameCategoryModal
          categoryId={renameCat.id}
          currentName={renameCat.name}
          onClose={() => setRenameCat(null)}
        />
      )}
      {confirmState && (
        <ConfirmModal
          title={confirmState.title}
          message={confirmState.message}
          onConfirm={confirmState.onConfirm}
          onClose={() => setConfirmState(null)}
        />
      )}
    </>
  );
}
