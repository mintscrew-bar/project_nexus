"use client";

import { useEffect, useState, useCallback } from "react";
import Image from "next/image";
import { adminApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  Badge,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import { Ban, CheckCircle } from "lucide-react";
import { BAN_REASONS, Pagination, Modal, type AddToast } from "../shared";

interface UserReportItem {
  id: string;
  category: "user";
  reason: string;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reporter: { id: string; username: string; avatar?: string };
  target: { id: string; username: string; avatar?: string; isBanned?: boolean };
  match?: { id: string } | null;
  /** 클랜 채팅 메시지 신고인 경우 해당 메시지 정보 */
  clanChatMessage?: { id: string; content: string; createdAt: string } | null;
}

interface PostReportItem {
  id: string;
  category: "post";
  reason: string;
  description: string | null;
  status: "PENDING" | "APPROVED" | "REJECTED";
  createdAt: string;
  reporter: { id: string; username: string; avatar?: string };
  targetLabel: string;
  post?: { id: string; title: string } | null;
  comment?: { id: string; content: string } | null;
}

type ReportItem = UserReportItem | PostReportItem;

const REPORT_CATEGORIES = [
  { key: "user", label: "유저 신고" },
  { key: "post", label: "게시글 신고" },
] as const;

const REASON_LABELS: Record<string, string> = {
  TOXICITY: "욕설/비매너",
  AFK: "잠수/이탈",
  GRIEFING: "고의 방해",
  CHEATING: "치팅/핵",
  SPAM: "스팸",
  HARASSMENT: "괴롭힘",
  INAPPROPRIATE: "부적절한 콘텐츠",
  MISINFORMATION: "허위 정보",
  OTHER: "기타",
};

export function ReportsTab({ addToast }: { addToast: AddToast }) {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [category, setCategory] = useState<"user" | "post">("user");
  const [status, setStatus] = useState<string>("PENDING");
  const [loading, setLoading] = useState(true);
  const [reviewModal, setReviewModal] = useState<ReportItem | null>(null);
  const [reviewStatus, setReviewStatus] = useState<"APPROVED" | "REJECTED">(
    "APPROVED",
  );
  const [reviewNote, setReviewNote] = useState("");
  const [banWithApprove, setBanWithApprove] = useState(false);
  const [banReasonSelect, setBanReasonSelect] = useState("");
  const [banReasonCustom, setBanReasonCustom] = useState("");

  const limit = 20;
  const totalPages = Math.ceil(total / limit);

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminApi.getReports({
        page,
        limit,
        status: status || undefined,
        category,
      });
      setReports(data.reports);
      setTotal(data.total);
    } catch {
      addToast("신고 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, status, category, addToast]);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  const resetReviewBanForm = () => {
    setReviewModal(null);
    setReviewNote("");
    setBanWithApprove(false);
    setBanReasonSelect("");
    setBanReasonCustom("");
  };

  const reportBanReasonFinal =
    banReasonSelect === "OTHER" ? banReasonCustom : banReasonSelect;

  const handleReview = async () => {
    if (!reviewModal) return;
    try {
      await adminApi.reviewReport(
        reviewModal.id,
        reviewStatus,
        reviewNote,
        reviewModal.category,
      );
      // 승인 + 밴 체크 시 대상 유저 영구 밴 처리
      if (
        reviewStatus === "APPROVED" &&
        banWithApprove &&
        reviewModal.category === "user"
      ) {
        const target = (reviewModal as UserReportItem).target;
        const reason = reportBanReasonFinal || reviewNote || reviewModal.reason;
        try {
          await adminApi.banUser(target.id, reason, undefined);
          addToast(`${target.username} 영구 밴 처리 완료`, "success");
        } catch {
          addToast("신고는 처리됐으나 밴 적용 실패", "error");
        }
      }
      setReports((prev) =>
        prev.map((r) =>
          r.id === reviewModal.id ? { ...r, status: reviewStatus } : r,
        ),
      );
      addToast("신고 처리 완료", "success");
      resetReviewBanForm();
    } catch {
      addToast("신고 처리 실패", "error");
    }
  };

  const handleQuickBan = async (target: { id: string; username: string }) => {
    try {
      await adminApi.banUser(target.id, "관리자 밴", undefined);
      addToast(`${target.username} 밴 완료`, "success");
      fetchReports();
    } catch {
      addToast("밴 처리 실패", "error");
    }
  };

  const handleQuickUnban = async (target: { id: string; username: string }) => {
    try {
      await adminApi.unbanUser(target.id);
      addToast(`${target.username} 밴 해제 완료`, "success");
      fetchReports();
    } catch {
      addToast("밴 해제 실패", "error");
    }
  };

  const STATUS_LABELS: Record<string, string> = {
    PENDING: "대기",
    APPROVED: "승인",
    REJECTED: "거부",
  };
  const STATUS_VARIANTS: Record<string, "default" | "secondary" | "danger"> = {
    PENDING: "secondary",
    APPROVED: "default",
    REJECTED: "danger",
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">신고 관리</h2>
        <div className="flex items-center gap-2">
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none"
          >
            <option value="">전체</option>
            <option value="PENDING">대기</option>
            <option value="APPROVED">승인</option>
            <option value="REJECTED">거부</option>
          </select>
          <span className="text-text-muted text-xs">총 {total}건</span>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="flex gap-1 bg-bg-tertiary/50 p-1 rounded-lg w-fit">
        {REPORT_CATEGORIES.map((cat) => (
          <button
            key={cat.key}
            onClick={() => {
              setCategory(cat.key);
              setPage(1);
            }}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              category === cat.key
                ? "bg-accent-primary text-white"
                : "text-text-muted hover:text-text-primary"
            }`}
          >
            {cat.label}
          </button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="flex justify-center py-12">
              <LoadingSpinner />
            </div>
          ) : reports.length === 0 ? (
            <p className="text-center text-text-muted py-12">
              신고가 없습니다.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-bg-tertiary text-text-muted">
                    <th className="text-left px-4 py-3 font-medium">신고자</th>
                    <th className="text-left px-4 py-3 font-medium">
                      {category === "user" ? "대상 유저" : "대상 콘텐츠"}
                    </th>
                    <th className="text-left px-4 py-3 font-medium">사유</th>
                    <th className="text-left px-4 py-3 font-medium">내용</th>
                    <th className="text-left px-4 py-3 font-medium">상태</th>
                    <th className="text-left px-4 py-3 font-medium">날짜</th>
                    <th className="text-left px-4 py-3 font-medium">액션</th>
                  </tr>
                </thead>
                <tbody>
                  {reports.map((r) => (
                    <tr
                      key={r.id}
                      className="border-b border-bg-tertiary/50 hover:bg-bg-tertiary/30"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          {r.reporter.avatar && (
                            <Image
                              src={r.reporter.avatar}
                              alt=""
                              width={20}
                              height={20}
                              className="w-5 h-5 rounded-full"
                            />
                          )}
                          <span className="text-text-secondary">
                            {r.reporter.username}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {r.category === "user" ? (
                          <div className="flex items-center gap-2">
                            {(r as UserReportItem).target.avatar && (
                              <Image
                                src={(r as UserReportItem).target.avatar!}
                                alt=""
                                width={20}
                                height={20}
                                className="w-5 h-5 rounded-full"
                              />
                            )}
                            <span className="font-medium text-text-primary">
                              {(r as UserReportItem).target.username}
                            </span>
                            {(r as UserReportItem).target.isBanned && (
                              <Badge variant="danger" className="text-[9px]">
                                차단됨
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-text-secondary text-xs max-w-40 truncate block">
                            {(r as PostReportItem).targetLabel}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant="secondary" className="text-[10px]">
                          {REASON_LABELS[r.reason] ?? r.reason}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-secondary text-xs max-w-48">
                        <span className="truncate block">
                          {r.description || "-"}
                        </span>
                        {/* 클랜 채팅 메시지 신고인 경우 태그 표시 */}
                        {r.category === "user" &&
                          (r as UserReportItem).clanChatMessage && (
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded text-[9px] bg-purple-500/20 text-purple-300">
                              클랜 채팅
                            </span>
                          )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant={STATUS_VARIANTS[r.status] ?? "default"}
                          className="text-[10px]"
                        >
                          {STATUS_LABELS[r.status] ?? r.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-text-muted text-xs whitespace-nowrap">
                        {new Date(r.createdAt).toLocaleDateString("ko-KR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          {r.status === "PENDING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setReviewModal(r)}
                            >
                              처리
                            </Button>
                          )}
                          {r.category === "user" &&
                            ((r as UserReportItem).target.isBanned ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleQuickUnban((r as UserReportItem).target)
                                }
                              >
                                <CheckCircle className="h-3.5 w-3.5 mr-1" />
                                밴해제
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="danger"
                                onClick={() =>
                                  handleQuickBan((r as UserReportItem).target)
                                }
                              >
                                <Ban className="h-3.5 w-3.5 mr-1" />밴
                              </Button>
                            ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </CardContent>
      </Card>

      {reviewModal && (
        <Modal
          title="신고 처리"
          onClose={() => {
            setReviewModal(null);
            setReviewNote("");
          }}
        >
          <div className="space-y-3">
            <div className="bg-bg-tertiary rounded-lg p-3 text-sm space-y-2">
              <div className="flex items-center gap-2 text-text-muted text-xs">
                <Badge variant="secondary" className="text-[9px]">
                  {reviewModal.category === "user"
                    ? "유저 신고"
                    : "게시글 신고"}
                </Badge>
                <span>
                  {REASON_LABELS[reviewModal.reason] ?? reviewModal.reason}
                </span>
              </div>
              <p className="text-text-primary">
                {reviewModal.description ?? reviewModal.reason}
              </p>
              {reviewModal.category === "user" && (
                <p className="text-text-muted text-xs">
                  대상: {(reviewModal as UserReportItem).target.username}
                </p>
              )}
              {reviewModal.category === "post" && (
                <p className="text-text-muted text-xs">
                  대상: {(reviewModal as PostReportItem).targetLabel}
                </p>
              )}
              {/* 클랜 채팅 메시지 신고인 경우 메시지 내용 표시 */}
              {reviewModal.category === "user" &&
                (reviewModal as UserReportItem).clanChatMessage && (
                  <div className="mt-2 bg-bg-secondary rounded-lg p-2 border border-bg-elevated">
                    <p className="text-[10px] text-text-muted mb-1">
                      신고된 클랜 채팅 메시지
                    </p>
                    <p className="text-xs text-text-secondary">
                      {(reviewModal as UserReportItem).clanChatMessage!.content}
                    </p>
                  </div>
                )}
            </div>
            <div className="flex gap-2">
              {(["APPROVED", "REJECTED"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setReviewStatus(s)}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${
                    reviewStatus === s
                      ? s === "APPROVED"
                        ? "bg-green-500/20 text-green-400 border border-green-500/50"
                        : "bg-red-500/20 text-red-400 border border-red-500/50"
                      : "bg-bg-tertiary text-text-muted"
                  }`}
                >
                  {s === "APPROVED" ? "승인 (제재)" : "거부"}
                </button>
              ))}
            </div>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="검토 메모 (선택)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
            />
            {/* 승인 시 밴 옵션 (유저 신고만) */}
            {reviewStatus === "APPROVED" && reviewModal.category === "user" && (
              <div className="space-y-2 border border-red-500/20 rounded-lg p-3 bg-red-500/5">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={banWithApprove}
                    onChange={(e) => setBanWithApprove(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-red-400 font-medium">
                    대상 유저 ({(reviewModal as UserReportItem).target.username}
                    ) 밴 적용
                  </span>
                </label>
                {banWithApprove && (
                  <div className="space-y-2 pl-6 pt-1">
                    <label className="block text-xs text-text-muted">
                      밴 사유
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {BAN_REASONS.map((r) => (
                        <button
                          key={r.value}
                          onClick={() => setBanReasonSelect(r.value)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                            banReasonSelect === r.value
                              ? "bg-red-500/20 text-red-400 border border-red-500/50"
                              : "bg-bg-tertiary text-text-muted hover:text-text-primary"
                          }`}
                        >
                          {r.label}
                        </button>
                      ))}
                    </div>
                    {banReasonSelect === "OTHER" && (
                      <input
                        type="text"
                        value={banReasonCustom}
                        onChange={(e) => setBanReasonCustom(e.target.value)}
                        placeholder="사유를 직접 입력하세요"
                        className="w-full mt-1.5 px-3 py-1.5 rounded-lg bg-bg-tertiary text-text-primary text-sm focus:outline-none focus:ring-1 focus:ring-red-500/50"
                      />
                    )}
                    <p className="text-[11px] text-red-400">
                      영구 밴이 적용됩니다.
                    </p>
                  </div>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={resetReviewBanForm}>
                취소
              </Button>
              <Button variant="primary" onClick={handleReview}>
                처리 완료
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
