"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Gift,
  Pencil,
  Percent,
  Search,
  Undo2,
} from "lucide-react";
import {
  adminApi,
  adminShopApi,
  type AdminShopDiscount,
  type AdminShopItem,
} from "@/lib/api-client";
import {
  Button,
  Card,
  CardContent,
  LoadingSpinner,
  Modal,
} from "@/components/ui";
import {
  COSMETICS,
  MEDAL_LABEL,
  RARITY_LABEL,
  SLOT_LABEL,
  type CosmeticSlot,
} from "@/components/cosmetics/catalog";
import { cn } from "@/lib/utils";
import { RowActions, StatCard, type AddToast } from "../shared";
import { useConfirm } from "../ConfirmDialog";

type Rarity = AdminShopItem["rarity"];
const RARITIES: Rarity[] = ["STARTER", "COMMON", "PREMIUM", "RARE"];
const SLOTS = Object.keys(SLOT_LABEL) as CosmeticSlot[];

/** 코드에 정의된 기본 이름(관리자가 바꾸지 않았을 때 보이는 이름) */
const defaultName = (code: string) =>
  COSMETICS.find((c) => c.code === code)?.name ?? code;
const shownName = (item: AdminShopItem) => item.name ?? defaultName(item.code);

const errMsg = (e: unknown, fallback: string) =>
  (e as { response?: { data?: { message?: string } } })?.response?.data
    ?.message ?? fallback;

/** datetime-local 입력값(현지 시각) ↔ ISO */
const toLocalInput = (d: Date) => {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};

const STATUS_STYLE: Record<AdminShopDiscount["status"], string> = {
  LIVE: "bg-green-500/15 text-green-400",
  SCHEDULED: "bg-sky-500/15 text-sky-300",
  ENDED: "bg-bg-tertiary text-text-muted",
  OFF: "bg-bg-tertiary text-text-muted",
};
const STATUS_LABEL: Record<AdminShopDiscount["status"], string> = {
  LIVE: "진행 중",
  SCHEDULED: "예정",
  ENDED: "끝남",
  OFF: "꺼짐",
};

/**
 * 관리자 「상점 관리」 — 1단계(2026-11-19): 상품별 판매 현황, 상품 수정(이름·설명·가격·등급·
 * 순서), 판매 켜기/끄기, 숨기기(삭제), 상품 지급·회수, 기간 할인.
 * 상품 추가·번들은 2단계. 그림·자리는 코드 원본이라 여기서 바꾸지 않는다.
 */
export function ShopTab({ addToast }: { addToast: AddToast }) {
  const queryClient = useQueryClient();
  const { confirm, dialog } = useConfirm();
  const itemsQuery = useQuery({
    queryKey: ["admin-shop", "items"],
    queryFn: adminShopApi.listItems,
  });
  const discountsQuery = useQuery({
    queryKey: ["admin-shop", "discounts"],
    queryFn: adminShopApi.listDiscounts,
  });
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ["admin-shop"] });
    // 상점 화면·홈 상점 줄도 새 값으로
    void queryClient.invalidateQueries({ queryKey: ["shop"] });
  };

  const [slot, setSlot] = useState<CosmeticSlot | "ALL">("ALL");
  const items = useMemo(
    () =>
      (itemsQuery.data ?? []).filter((i) => slot === "ALL" || i.slot === slot),
    [itemsQuery.data, slot],
  );
  const all = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const totals = useMemo(
    () => ({
      sold: all.reduce((s, i) => s + i.stats.sold, 0),
      medals: all.reduce((s, i) => s + i.stats.medals, 0),
      onSale: all.filter((i) => i.onSale && !i.hidden).length,
      live: (discountsQuery.data ?? []).filter((d) => d.status === "LIVE")
        .length,
    }),
    [all, discountsQuery.data],
  );

  const update = useMutation({
    mutationFn: ({
      code,
      patch,
    }: {
      code: string;
      patch: Parameters<typeof adminShopApi.updateItem>[1];
    }) => adminShopApi.updateItem(code, patch),
    onSuccess: () => {
      addToast("상품을 바꿨어요.", "success");
      refresh();
    },
    onError: (e) => addToast(errMsg(e, "바꾸지 못했어요."), "error"),
  });

  const [editing, setEditing] = useState<AdminShopItem | null>(null);

  return (
    <div className="space-y-6">
      {dialog}
      <div>
        <h2 className="text-lg font-semibold text-text-primary">상점 관리</h2>
        <p className="mt-1 text-xs text-text-tertiary">
          상품의 그림·자리는 코드가 원본이고, 여기서 바꾼 이름·가격·판매 여부는
          바로 상점과 홈에 반영됩니다. 숨기면 진열·구매에서 빠지고 이미 산
          사람은 계속 씁니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          icon={<Gift className="h-5 w-5" />}
          label="판매 중 상품"
          value={totals.onSale}
        />
        <StatCard
          icon={<Gift className="h-5 w-5" />}
          label="누적 판매"
          value={totals.sold}
        />
        <StatCard
          icon={<Gift className="h-5 w-5" />}
          label={`쓴 ${MEDAL_LABEL}(환불 뺌)`}
          value={totals.medals}
        />
        <StatCard
          icon={<Percent className="h-5 w-5" />}
          label="진행 중 할인"
          value={totals.live}
        />
      </div>

      {/* ── 상품 표 ── */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center gap-1 border-b border-bg-tertiary px-4 py-3">
            {(["ALL", ...SLOTS] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSlot(s)}
                className={cn(
                  "rounded-md px-3 py-1 text-xs font-semibold",
                  slot === s
                    ? "bg-accent-primary text-accent-on"
                    : "bg-bg-tertiary text-text-secondary hover:text-text-primary",
                )}
              >
                {s === "ALL" ? "전체" : SLOT_LABEL[s]}
              </button>
            ))}
          </div>
          {itemsQuery.isLoading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-xs text-text-muted">
                    <th className="px-4 py-2.5 text-left font-medium">상품</th>
                    <th className="px-3 py-2.5 text-left font-medium">등급</th>
                    <th className="px-3 py-2.5 text-right font-medium">가격</th>
                    <th className="px-3 py-2.5 text-right font-medium">판매</th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      쓴 {MEDAL_LABEL}
                    </th>
                    <th className="px-3 py-2.5 text-right font-medium">
                      보유·장착
                    </th>
                    <th className="px-3 py-2.5 text-left font-medium">상태</th>
                    <th className="px-4 py-2.5 text-right font-medium">동작</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr
                      key={item.code}
                      className={cn(
                        "group border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30",
                        item.hidden && "opacity-55",
                      )}
                    >
                      <td className="px-4 py-2.5">
                        <p className="font-medium text-text-primary">
                          {shownName(item)}
                          {item.name && (
                            <span className="ml-1.5 text-[10px] text-text-muted">
                              (원래 {defaultName(item.code)})
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-text-muted">
                          {SLOT_LABEL[item.slot]} · {item.code}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-text-secondary">
                        {RARITY_LABEL[item.rarity]}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        {item.discountPercent > 0 ? (
                          <>
                            <span className="mr-1 text-xs text-text-muted line-through">
                              {item.basePrice.toLocaleString()}
                            </span>
                            <span className="font-semibold text-amber-300">
                              {item.price.toLocaleString()}
                            </span>
                            <span className="ml-1 text-[10px] text-red-400">
                              -{item.discountPercent}%
                            </span>
                          </>
                        ) : (
                          <span className="font-semibold text-text-primary">
                            {item.price.toLocaleString()}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                        {item.stats.sold.toLocaleString()}
                        {item.stats.refunds > 0 && (
                          <span className="ml-1 text-[10px] text-text-muted">
                            환불 {item.stats.refunds}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                        {item.stats.medals.toLocaleString()}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-text-secondary">
                        {item.stats.owners} · {item.stats.equipped}
                        {item.stats.granted > 0 && (
                          <span className="ml-1 text-[10px] text-text-muted">
                            지급 {item.stats.granted}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs">
                        {item.hidden ? (
                          <span className="text-text-muted">숨김</span>
                        ) : item.onSale ? (
                          <span className="text-green-400">판매 중</span>
                        ) : (
                          <span className="text-amber-300">판매 중지</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        <RowActions className="justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setEditing(item)}
                          >
                            <Pencil className="mr-1 h-3.5 w-3.5" />
                            수정
                          </Button>
                          {!item.hidden && (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={update.isPending}
                              onClick={() =>
                                update.mutate({
                                  code: item.code,
                                  patch: { onSale: !item.onSale },
                                })
                              }
                            >
                              {item.onSale ? "판매 중지" : "판매 시작"}
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant={item.hidden ? "outline" : "danger"}
                            disabled={update.isPending}
                            onClick={async () => {
                              if (
                                !item.hidden &&
                                !(await confirm({
                                  title: "상품 숨기기(삭제)",
                                  message: (
                                    <>
                                      「{shownName(item)}」을 진열과 구매에서
                                      뺍니다. 이미 산 {item.stats.owners}명은
                                      계속 씁니다. 언제든 되살릴 수 있어요.
                                    </>
                                  ),
                                  confirmLabel: "숨기기",
                                  danger: true,
                                }))
                              )
                                return;
                              update.mutate({
                                code: item.code,
                                patch: { hidden: !item.hidden },
                              });
                            }}
                          >
                            {item.hidden ? (
                              <>
                                <Eye className="mr-1 h-3.5 w-3.5" />
                                되살리기
                              </>
                            ) : (
                              <>
                                <EyeOff className="mr-1 h-3.5 w-3.5" />
                                숨기기
                              </>
                            )}
                          </Button>
                        </RowActions>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <GrantPanel
          items={all}
          addToast={addToast}
          onDone={refresh}
          confirm={confirm}
        />
        <DiscountPanel
          items={all}
          discounts={discountsQuery.data ?? []}
          addToast={addToast}
          onDone={refresh}
        />
      </div>

      {editing && (
        <EditItemModal
          item={editing}
          onClose={() => setEditing(null)}
          onSave={(patch) =>
            update.mutate(
              { code: editing.code, patch },
              { onSuccess: () => setEditing(null) },
            )
          }
          saving={update.isPending}
        />
      )}
    </div>
  );
}

/** 상품 수정 창 — 비우면 원래(코드) 값으로 돌아간다 */
function EditItemModal({
  item,
  onClose,
  onSave,
  saving,
}: {
  item: AdminShopItem;
  onClose: () => void;
  onSave: (patch: Parameters<typeof adminShopApi.updateItem>[1]) => void;
  saving: boolean;
}) {
  const [name, setName] = useState(item.name ?? "");
  const [description, setDescription] = useState(item.description ?? "");
  const [price, setPrice] = useState(String(item.basePrice));
  const [rarity, setRarity] = useState<Rarity>(item.rarity);
  const [sortOrder, setSortOrder] = useState(String(item.sortOrder));
  const base = COSMETICS.find((c) => c.code === item.code);

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`상품 수정 — ${shownName(item)}`}
      size="md"
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs text-text-muted">
            이름 (비우면 「{base?.name}」)
          </span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            className="mt-1 w-full rounded-lg bg-bg-tertiary px-3 py-2 text-text-primary focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-xs text-text-muted">
            설명 (비우면 기본 설명)
          </span>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={200}
            rows={2}
            placeholder={base?.description}
            className="mt-1 w-full rounded-lg bg-bg-tertiary px-3 py-2 text-text-primary focus:outline-none"
          />
        </label>
        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="text-xs text-text-muted">가격(할인 전)</span>
            <input
              type="number"
              min={1}
              max={100000}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="mt-1 w-full rounded-lg bg-bg-tertiary px-3 py-2 tabular-nums text-text-primary focus:outline-none"
            />
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">등급</span>
            <select
              value={rarity}
              onChange={(e) => setRarity(e.target.value as Rarity)}
              className="mt-1 w-full rounded-lg bg-bg-tertiary px-3 py-2 text-text-primary focus:outline-none"
            >
              {RARITIES.map((r) => (
                <option key={r} value={r}>
                  {RARITY_LABEL[r]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs text-text-muted">진열 순서</span>
            <input
              type="number"
              min={0}
              max={9999}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="mt-1 w-full rounded-lg bg-bg-tertiary px-3 py-2 tabular-nums text-text-primary focus:outline-none"
            />
          </label>
        </div>
        <div className="flex justify-between gap-2 pt-2">
          <Button
            variant="outline"
            size="sm"
            disabled={saving}
            onClick={() =>
              onSave({
                name: null,
                description: null,
                price: null,
                rarity: null,
                sortOrder: null,
              })
            }
          >
            <Undo2 className="mr-1 h-3.5 w-3.5" />
            전부 원래대로
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              취소
            </Button>
            <Button
              size="sm"
              disabled={saving || !Number(price) || Number(price) < 1}
              onClick={() =>
                onSave({
                  name: name.trim() || null,
                  description: description.trim() || null,
                  price: Math.round(Number(price)),
                  rarity,
                  sortOrder: Math.round(Number(sortOrder)),
                })
              }
            >
              저장
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

interface PickedUser {
  id: string;
  username: string;
}

/** 상품 지급(선물)·회수 */
function GrantPanel({
  items,
  addToast,
  onDone,
  confirm,
}: {
  items: AdminShopItem[];
  addToast: AddToast;
  onDone: () => void;
  confirm: ReturnType<typeof useConfirm>["confirm"];
}) {
  const [query, setQuery] = useState("");
  // 입력이 0.3초 멈춘 뒤의 검색어 — 타이머 안에서만 바꾼다
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);
  const search = useQuery({
    queryKey: ["admin-shop", "user-search", debounced],
    queryFn: async () =>
      ((await adminApi.getUsers({ search: debounced, limit: 6, kind: "all" }))
        .users ?? []) as PickedUser[],
    enabled: debounced.length > 0,
    staleTime: 30 * 1000,
  });
  const [picked, setPicked] = useState<PickedUser | null>(null);
  const [code, setCode] = useState("");
  const [memo, setMemo] = useState("");
  const results = query.trim() && !picked ? (search.data ?? []) : [];

  const run = useMutation({
    mutationFn: (kind: "grant" | "revoke") =>
      kind === "grant"
        ? adminShopApi.grant(picked!.id, code, memo.trim())
        : adminShopApi.revoke(picked!.id, code, memo.trim()),
    onSuccess: (_r, kind) => {
      addToast(
        kind === "grant" ? "상품을 지급했어요." : "상품을 회수했어요.",
        "success",
      );
      setMemo("");
      onDone();
    },
    onError: (e) => addToast(errMsg(e, "처리하지 못했어요."), "error"),
  });
  const ready = Boolean(picked && code && memo.trim());

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Gift className="h-4 w-4 text-text-tertiary" />
          상품 지급·회수
        </h3>
        {picked ? (
          <div className="flex items-center justify-between rounded-lg bg-bg-tertiary/60 px-3 py-2 text-sm">
            <span className="font-medium text-text-primary">
              {picked.username}
            </span>
            <button
              type="button"
              onClick={() => {
                setPicked(null);
                setQuery("");
              }}
              className="text-xs text-text-muted hover:text-text-primary"
            >
              바꾸기
            </button>
          </div>
        ) : (
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="닉네임으로 찾기"
              className="w-full rounded-lg bg-bg-tertiary py-2 pl-9 pr-3 text-sm text-text-primary focus:outline-none"
            />
            {results.length > 0 && (
              <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-bg-elevated bg-bg-primary shadow-xl">
                {results.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => setPicked(u)}
                    className="block w-full px-3 py-2 text-left text-sm text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                  >
                    {u.username}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <select
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="w-full rounded-lg bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none"
        >
          <option value="">상품 고르기</option>
          {SLOTS.map((s) => (
            <optgroup key={s} label={SLOT_LABEL[s]}>
              {items
                .filter((i) => i.slot === s)
                .map((i) => (
                  <option key={i.code} value={i.code}>
                    {shownName(i)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <input
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          maxLength={300}
          placeholder="사유 (감사 기록에 남습니다)"
          className="w-full rounded-lg bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <Button
            size="sm"
            disabled={!ready || run.isPending}
            onClick={() => run.mutate("grant")}
          >
            지급하기
          </Button>
          <Button
            size="sm"
            variant="danger"
            disabled={!ready || run.isPending}
            onClick={async () => {
              if (
                !(await confirm({
                  title: "상품 회수",
                  message: (
                    <>
                      {picked?.username} 님의 「{defaultName(code)}」을
                      회수합니다.
                      {MEDAL_LABEL}은 돌려주지 않아요(돌려주려면 메달·원장 탭의
                      환불).
                    </>
                  ),
                  confirmLabel: "회수",
                  danger: true,
                }))
              )
                return;
              run.mutate("revoke");
            }}
          >
            회수하기
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** 기간 할인 — 만들기·목록·끄기 */
function DiscountPanel({
  items,
  discounts,
  addToast,
  onDone,
}: {
  items: AdminShopItem[];
  discounts: AdminShopDiscount[];
  addToast: AddToast;
  onDone: () => void;
}) {
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("20");
  const [startsAt, setStartsAt] = useState(() => toLocalInput(new Date()));
  const [endsAt, setEndsAt] = useState(() =>
    toLocalInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
  );
  // 비우면 전체 상품
  const [codes, setCodes] = useState<string[]>([]);

  const create = useMutation({
    mutationFn: () =>
      adminShopApi.createDiscount({
        name: name.trim(),
        percent: Math.round(Number(percent)),
        itemCodes: codes,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
      }),
    onSuccess: () => {
      addToast("할인을 만들었어요.", "success");
      setName("");
      setCodes([]);
      onDone();
    },
    onError: (e) => addToast(errMsg(e, "만들지 못했어요."), "error"),
  });
  const stop = useMutation({
    mutationFn: (id: string) => adminShopApi.stopDiscount(id),
    onSuccess: () => {
      addToast("할인을 껐어요.", "success");
      onDone();
    },
    onError: (e) => addToast(errMsg(e, "끄지 못했어요."), "error"),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <Percent className="h-4 w-4 text-text-tertiary" />
          기간 할인
        </h3>
        <div className="grid grid-cols-[1fr_88px] gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            placeholder="할인 이름 (예: 겨울 맞이)"
            className="rounded-lg bg-bg-tertiary px-3 py-2 text-sm text-text-primary focus:outline-none"
          />
          <label className="flex items-center gap-1 rounded-lg bg-bg-tertiary px-3 text-sm">
            <input
              type="number"
              min={1}
              max={90}
              value={percent}
              onChange={(e) => setPercent(e.target.value)}
              className="w-full bg-transparent tabular-nums text-text-primary focus:outline-none"
            />
            %
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs text-text-muted">
          <label>
            시작
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              className="mt-1 w-full rounded-lg bg-bg-tertiary px-2 py-1.5 text-sm text-text-primary focus:outline-none"
            />
          </label>
          <label>
            끝
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              className="mt-1 w-full rounded-lg bg-bg-tertiary px-2 py-1.5 text-sm text-text-primary focus:outline-none"
            />
          </label>
        </div>
        <div>
          <p className="mb-1 text-xs text-text-muted">
            대상 상품 —{" "}
            {codes.length === 0 ? "전체 상품" : `${codes.length}개 고름`}
          </p>
          <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
            {items.map((i) => {
              const on = codes.includes(i.code);
              return (
                <button
                  key={i.code}
                  type="button"
                  onClick={() =>
                    setCodes((c) =>
                      on ? c.filter((x) => x !== i.code) : [...c, i.code],
                    )
                  }
                  className={cn(
                    "rounded-md px-2 py-0.5 text-[11px]",
                    on
                      ? "bg-accent-primary text-accent-on"
                      : "bg-bg-tertiary text-text-secondary hover:text-text-primary",
                  )}
                >
                  {shownName(i)}
                </button>
              );
            })}
          </div>
        </div>
        <Button
          size="sm"
          disabled={!name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          할인 만들기
        </Button>

        <div className="space-y-1.5 border-t border-bg-tertiary pt-3">
          {discounts.length === 0 && (
            <p className="text-xs text-text-muted">만든 할인이 없어요.</p>
          )}
          {discounts.map((d) => (
            <div
              key={d.id}
              className="group flex items-center justify-between gap-2 rounded-lg bg-bg-tertiary/40 px-3 py-2 text-xs"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span
                    className={cn(
                      "rounded px-1.5 py-0.5 text-[10px]",
                      STATUS_STYLE[d.status],
                    )}
                  >
                    {STATUS_LABEL[d.status]}
                  </span>
                  <span className="truncate font-medium text-text-primary">
                    {d.name} -{d.percent}%
                  </span>
                </span>
                <span className="mt-0.5 block text-text-muted">
                  {new Date(d.startsAt).toLocaleString("ko-KR")} ~{" "}
                  {new Date(d.endsAt).toLocaleString("ko-KR")} ·{" "}
                  {d.itemCodes.length === 0
                    ? "전체"
                    : `${d.itemCodes.length}개 상품`}
                </span>
              </span>
              {(d.status === "LIVE" || d.status === "SCHEDULED") && (
                <RowActions>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={stop.isPending}
                    onClick={() => stop.mutate(d.id)}
                  >
                    끄기
                  </Button>
                </RowActions>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
