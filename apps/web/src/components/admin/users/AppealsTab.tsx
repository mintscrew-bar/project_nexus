"use client";

import { useEffect, useState, useCallback } from "react";
import { appealApi } from "@/lib/api-client";
import {
  Card,
  CardContent,
  Badge,
  Button,
  LoadingSpinner,
} from "@/components/ui";
import { CheckCircle, XCircle } from "lucide-react";
import { Pagination, Modal, type AddToast } from "../shared";

export function AppealsTab({ addToast }: { addToast: AddToast }) {
  const [appeals, setAppeals] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("PENDING");
  const [loading, setLoading] = useState(true);
  // 처리 모달 상태
  const [reviewTarget, setReviewTarget] = useState<any>(null);
  const [adminNote, setAdminNote] = useState("");
  const [isReviewing, setIsReviewing] = useState(false);

  const LIMIT = 20;

  const fetchAppeals = useCallback(async () => {
    setLoading(true);
    try {
      const data = await appealApi.list({
        page,
        limit: LIMIT,
        status: statusFilter || undefined,
      });
      setAppeals(data.appeals);
      setTotal(data.total);
    } catch {
      addToast("이의신청 목록 로드 실패", "error");
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, addToast]);

  useEffect(() => {
    fetchAppeals();
  }, [fetchAppeals]);

  const handleReview = async (status: "APPROVED" | "REJECTED") => {
    if (!reviewTarget) return;
    setIsReviewing(true);
    try {
      await appealApi.review(
        reviewTarget.id,
        status,
        adminNote.trim() || undefined,
      );
      addToast(
        status === "APPROVED"
          ? "이의신청을 승인했습니다. 제재가 해제되었습니다."
          : "이의신청을 거절했습니다.",
        "success",
      );
      setReviewTarget(null);
      setAdminNote("");
      fetchAppeals();
    } catch (e: any) {
      addToast(
        e?.response?.data?.message ?? "처리 중 오류가 발생했습니다.",
        "error",
      );
    } finally {
      setIsReviewing(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  const statusBadge = (s: string) => {
    if (s === "PENDING")
      return (
        <Badge className="bg-yellow-500/20 text-yellow-400 border-0">
          심사중
        </Badge>
      );
    if (s === "APPROVED")
      return (
        <Badge className="bg-green-500/20 text-green-400 border-0">승인</Badge>
      );
    return <Badge className="bg-red-500/20 text-red-400 border-0">거절</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text-primary">
          이의신청 관리
        </h2>
        <div className="flex gap-2">
          {(["", "PENDING", "APPROVED", "REJECTED"] as const).map((s) => (
            <button
              key={s}
              onClick={() => {
                setStatusFilter(s);
                setPage(1);
              }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-accent-primary text-white"
                  : "bg-bg-tertiary text-text-secondary hover:text-text-primary"
              }`}
            >
              {s === ""
                ? "전체"
                : s === "PENDING"
                  ? "심사중"
                  : s === "APPROVED"
                    ? "승인"
                    : "거절"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20">
          <LoadingSpinner />
        </div>
      ) : appeals.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-text-muted">
            이의신청이 없습니다.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="divide-y divide-bg-tertiary">
              {appeals.map((appeal) => (
                <div key={appeal.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      {/* 유저 정보 */}
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium text-text-primary text-sm">
                          {appeal.user?.username}
                        </span>
                        {statusBadge(appeal.status)}
                        {appeal.user?.isBanned && (
                          <span className="text-xs text-accent-danger">밴</span>
                        )}
                        {appeal.user?.isRestricted && (
                          <span className="text-xs text-accent-warning">
                            임시제재
                          </span>
                        )}
                      </div>
                      {/* 밴 사유 */}
                      {appeal.user?.banReason && (
                        <p className="text-xs text-text-muted mb-1">
                          밴 사유: {appeal.user.banReason}
                        </p>
                      )}
                      {/* 이의신청 사유 */}
                      <p className="text-sm text-text-secondary whitespace-pre-wrap break-words">
                        {appeal.reason}
                      </p>
                      {/* 관리자 메모 */}
                      {appeal.adminNote && (
                        <p className="text-xs text-text-muted mt-1">
                          관리자 메모: {appeal.adminNote}
                        </p>
                      )}
                      <p className="text-xs text-text-muted mt-1">
                        접수:{" "}
                        {new Date(appeal.createdAt).toLocaleString("ko-KR")}
                        {appeal.reviewer &&
                          ` · 처리: ${appeal.reviewer.username}`}
                      </p>
                    </div>
                    {/* 처리 버튼 (PENDING만) */}
                    {appeal.status === "PENDING" && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setReviewTarget(appeal);
                          setAdminNote("");
                        }}
                      >
                        심사하기
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Pagination page={page} totalPages={totalPages} onChange={setPage} />

      {/* 심사 모달 */}
      {reviewTarget && (
        <Modal
          title={`이의신청 심사 — ${reviewTarget.user?.username}`}
          onClose={() => setReviewTarget(null)}
        >
          <div className="space-y-4">
            <div>
              <p className="text-xs text-text-muted mb-1">이의신청 사유</p>
              <p className="text-sm text-text-primary whitespace-pre-wrap bg-bg-tertiary rounded-lg p-3">
                {reviewTarget.reason}
              </p>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5">
                관리자 메모 (선택)
              </label>
              <textarea
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={3}
                placeholder="유저에게 전달할 메모 (선택)"
                className="w-full px-3 py-2 rounded-lg bg-bg-tertiary text-text-primary text-sm resize-none focus:outline-none focus:ring-1 focus:ring-accent-primary"
              />
            </div>
            <div className="flex gap-2">
              <Button
                className="flex-1 bg-accent-success hover:bg-accent-success/80"
                onClick={() => handleReview("APPROVED")}
                disabled={isReviewing}
              >
                <CheckCircle className="h-4 w-4 mr-1" />
                승인 (제재 해제)
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-accent-danger text-accent-danger hover:bg-accent-danger/10"
                onClick={() => handleReview("REJECTED")}
                disabled={isReviewing}
              >
                <XCircle className="h-4 w-4 mr-1" />
                거절
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
