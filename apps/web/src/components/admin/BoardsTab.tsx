"use client";

import { useEffect, useState, useCallback } from "react";
import { boardApi, type Board, type BoardInput } from "@/lib/api-client";
import {
  Card,
  CardContent,
  Button,
  Input,
  Select,
  Switch,
  Badge,
  LoadingSpinner,
  Modal,
  ConfirmModal,
} from "@/components/ui";
import {
  Plus,
  Pencil,
  Trash2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Lock,
} from "lucide-react";

type AddToast = (msg: string, type: "success" | "error") => void;

/** 빈 폼 기본값 */
const emptyForm: BoardInput = {
  name: "",
  slug: "",
  fullName: "",
  description: "",
  iconName: "",
  color: "",
  writeRole: null,
  isActive: true,
  isHidden: false,
};

const WRITE_ROLE_OPTIONS = [
  { value: "ALL", label: "모든 유저" },
  { value: "MODERATOR", label: "매니저 이상" },
  { value: "ADMIN", label: "관리자만" },
];

const WRITE_ROLE_LABELS: Record<NonNullable<Board["writeRole"]>, string> = {
  USER: "유저+",
  MODERATOR: "매니저+",
  ADMIN: "관리자",
};

export function BoardsTab({ addToast }: { addToast: AddToast }) {
  const [boards, setBoards] = useState<Board[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 생성/수정 모달 상태
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Board | null>(null);
  const [form, setForm] = useState<BoardInput>(emptyForm);

  // 삭제 확인 모달
  const [deleteTarget, setDeleteTarget] = useState<Board | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await boardApi.listForAdmin();
      setBoards(data);
    } catch {
      addToast("게시판 목록을 불러오지 못했습니다.", "error");
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (board: Board) => {
    setEditing(board);
    setForm({
      name: board.name,
      slug: board.slug,
      fullName: board.fullName ?? "",
      description: board.description ?? "",
      iconName: board.iconName ?? "",
      color: board.color ?? "",
      writeRole: board.writeRole,
      isActive: board.isActive,
      isHidden: board.isHidden,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      addToast("게시판 이름을 입력해주세요.", "error");
      return;
    }
    setSaving(true);
    try {
      // 빈 문자열은 null 로 정리
      const payload: BoardInput = {
        ...form,
        fullName: form.fullName?.trim() || null,
        description: form.description?.trim() || null,
        iconName: form.iconName?.trim() || null,
        color: form.color?.trim() || null,
      };
      if (editing) {
        await boardApi.update(editing.id, payload);
        addToast("게시판이 수정되었습니다.", "success");
      } else {
        await boardApi.create(payload);
        addToast("게시판이 생성되었습니다.", "success");
      }
      setModalOpen(false);
      await load();
    } catch (e: unknown) {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? "저장에 실패했습니다.";
      addToast(Array.isArray(msg) ? msg[0] : msg, "error");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await boardApi.remove(deleteTarget.id);
      addToast("게시판이 삭제되었습니다.", "success");
      setDeleteTarget(null);
      await load();
    } catch {
      addToast("삭제에 실패했습니다.", "error");
    }
  };

  // 순서 위/아래 이동 (인접 게시판과 order 교환)
  const move = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= boards.length) return;
    const a = boards[index];
    const b = boards[target];
    try {
      await boardApi.reorder([
        { id: a.id, order: b.order },
        { id: b.id, order: a.order },
      ]);
      await load();
    } catch {
      addToast("순서 변경에 실패했습니다.", "error");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-text-primary">게시판 관리</h2>
          <p className="text-sm text-text-secondary">
            커뮤니티 게시판을 추가·수정·삭제하고 순서와 권한을 관리합니다.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-1.5">
          <Plus className="h-4 w-4" /> 게시판 추가
        </Button>
      </div>

      <Card>
        <CardContent className="p-0 divide-y divide-border">
          {boards.length === 0 && (
            <div className="p-8 text-center text-text-secondary">
              게시판이 없습니다. &quot;게시판 추가&quot;로 만들어보세요.
            </div>
          )}
          {boards.map((board, i) => (
            <div
              key={board.id}
              className="flex items-center gap-3 p-3 sm:p-4"
            >
              {/* 순서 이동 */}
              <div className="flex flex-col">
                <button
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  className="text-text-muted hover:text-text-primary disabled:opacity-30"
                  aria-label="위로"
                >
                  <ArrowUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === boards.length - 1}
                  className="text-text-muted hover:text-text-primary disabled:opacity-30"
                  aria-label="아래로"
                >
                  <ArrowDown className="h-4 w-4" />
                </button>
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`font-semibold ${board.color || "text-text-primary"}`}>
                    {board.name}
                  </span>
                  <span className="text-xs text-text-muted">/{board.slug}</span>
                  {board.writeRole && (
                    <Badge variant="warning" className="gap-1">
                      <Lock className="h-3 w-3" />
                      {WRITE_ROLE_LABELS[board.writeRole]}
                    </Badge>
                  )}
                  {!board.isActive && <Badge variant="default">비활성</Badge>}
                  {board.isHidden && (
                    <Badge variant="default" className="gap-1">
                      <EyeOff className="h-3 w-3" /> 숨김
                    </Badge>
                  )}
                </div>
                {board.description && (
                  <p className="truncate text-sm text-text-secondary">
                    {board.description}
                  </p>
                )}
                <p className="text-xs text-text-muted">
                  글 {board._count?.posts ?? 0}개
                </p>
              </div>

              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => openEdit(board)}
                  className="gap-1"
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDeleteTarget(board)}
                  className="gap-1 text-accent-danger"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* 생성/수정 모달 */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? "게시판 수정" : "게시판 추가"}
        size="md"
      >
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-sm font-semibold text-text-primary">
              이름 *
            </label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: 자유"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-text-primary">
              슬러그 (URL)
            </label>
            <Input
              value={form.slug ?? ""}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
              placeholder="비워두면 이름에서 자동 생성"
              disabled={!!editing}
            />
            {editing && (
              <p className="mt-1 text-xs text-text-muted">
                기존 글 링크 보존을 위해 슬러그는 수정 시 변경하지 않는 것을 권장합니다.
              </p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-text-primary">
              전체 이름
            </label>
            <Input
              value={form.fullName ?? ""}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              placeholder="예: 자유게시판"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-text-primary">
              설명
            </label>
            <Input
              value={form.description ?? ""}
              onChange={(e) =>
                setForm({ ...form, description: e.target.value })
              }
              placeholder="게시판 설명"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-semibold text-text-primary">
                아이콘 (lucide)
              </label>
              <Input
                value={form.iconName ?? ""}
                onChange={(e) =>
                  setForm({ ...form, iconName: e.target.value })
                }
                placeholder="예: MessageCircle"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-semibold text-text-primary">
                색상 클래스
              </label>
              <Input
                value={form.color ?? ""}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                placeholder="예: text-accent-primary"
              />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-semibold text-text-primary">
              글쓰기 권한
            </label>
            <Select
              options={WRITE_ROLE_OPTIONS}
              value={form.writeRole ?? "ALL"}
              onChange={(v) =>
                setForm({
                  ...form,
                  writeRole: v === "ALL" ? null : (v as BoardInput["writeRole"]),
                })
              }
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-text-primary">
              <Eye className="h-4 w-4" /> 활성화
            </span>
            <Switch
              checked={form.isActive ?? true}
              onCheckedChange={(v) => setForm({ ...form, isActive: v })}
            />
          </div>
          <div className="flex items-center justify-between rounded-lg bg-bg-tertiary px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-text-primary">
              <EyeOff className="h-4 w-4" /> 목록에서 숨김
            </span>
            <Switch
              checked={form.isHidden ?? false}
              onCheckedChange={(v) => setForm({ ...form, isHidden: v })}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModalOpen(false)}>
              취소
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "저장 중..." : editing ? "수정" : "생성"}
            </Button>
          </div>
        </div>
      </Modal>

      {/* 삭제 확인 */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="게시판 삭제"
        message={`"${deleteTarget?.name}" 게시판을 삭제할까요? 게시글은 보존되지만 게시판 소속이 해제됩니다.`}
        confirmText="삭제"
        variant="danger"
      />
    </div>
  );
}
