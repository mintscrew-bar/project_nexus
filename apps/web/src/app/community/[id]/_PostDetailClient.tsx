"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Image from "next/image";
import { useAuthStore } from "@/stores/auth-store";
import { communityApi } from "@/lib/api-client";
import { resolveBoardIcon } from "@/lib/board-icons";
import {
  Card,
  CardContent,
  Button,
  Input,
  LoadingSpinner,
  Badge,
} from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ConfirmModal } from "@/components/ui/Modal";
import { MarkdownViewer } from "@/components/community/MarkdownViewer";
import { RichTextViewer } from "@/components/community/RichTextViewer";
import type { PostContentFormat, RichTextDocument } from "@/lib/rich-text";
import {
  ArrowLeft,
  Eye,
  Heart,
  Clock,
  MessageCircle,
  Send,
  Edit,
  Trash2,
  User,
  Megaphone,
  HelpCircle,
  Lightbulb,
  CornerDownRight,
  X,
  Check,
  ThumbsUp,
  Link,
  Bookmark,
  Flag,
  Tag,
} from "lucide-react";

// 게시글/댓글 신고 사유
const REPORT_REASONS: { value: string; label: string }[] = [
  { value: "SPAM", label: "스팸/광고" },
  { value: "HARASSMENT", label: "욕설/비하/혐오" },
  { value: "INAPPROPRIATE", label: "부적절한 콘텐츠" },
  { value: "MISINFORMATION", label: "허위 정보" },
  { value: "OTHER", label: "기타" },
];

type PostCategory = "NOTICE" | "FREE" | "TIP" | "QNA";

interface Comment {
  id: string;
  content: string;
  createdAt: string;
  isEdited: boolean;
  isBlinded?: boolean; // 임시조치(블라인드) 처리 여부
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
  _count?: {
    likes: number;
  };
  replies?: Comment[];
}

interface Post {
  id: string;
  title: string;
  content: string;
  contentFormat?: PostContentFormat;
  contentJson?: RichTextDocument | null;
  category: PostCategory | null;
  board?: {
    id: string;
    slug: string;
    name: string;
    fullName: string | null;
    iconName: string | null;
    color: string | null;
  } | null;
  views: number;
  isPinned: boolean;
  isEdited: boolean;
  isBlinded?: boolean; // 임시조치(블라인드) 처리 여부
  createdAt: string;
  updatedAt: string;
  author: {
    id: string;
    username: string;
    avatar: string | null;
  };
  comments: Comment[];
  tags?: { tag: { name: string } }[];
  _count?: {
    likes: number;
  };
}

const categoryConfig: Record<
  PostCategory,
  { label: string; icon: React.ElementType; color: string }
> = {
  NOTICE: { label: "공지", icon: Megaphone, color: "text-accent-danger" },
  FREE: { label: "자유", icon: MessageCircle, color: "text-text-secondary" },
  TIP: { label: "팁", icon: Lightbulb, color: "text-accent-gold" },
  QNA: { label: "Q&A", icon: HelpCircle, color: "text-accent-primary" },
};

export default function PostDetailClient() {
  const params = useParams();
  const router = useRouter();
  const postId = params.id as string;
  const { user, isAuthenticated } = useAuthStore();

  const [post, setPost] = useState<Post | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLiked, setHasLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [hasBookmarked, setHasBookmarked] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletePostConfirm, setDeletePostConfirm] = useState(false);
  const [deleteCommentId, setDeleteCommentId] = useState<string | null>(null);
  const [commentLikes, setCommentLikes] = useState<Record<string, { liked: boolean; count: number }>>({});
  const [replyTo, setReplyTo] = useState<{ id: string; username: string } | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editCommentText, setEditCommentText] = useState("");
  const { addToast } = useToast();

  // 신고 모달 상태
  type ReportTarget = { type: "post"; id: string } | { type: "comment"; id: string; authorName: string };
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState("SPAM");
  const [reportDescription, setReportDescription] = useState("");
  const [isSubmittingReport, setIsSubmittingReport] = useState(false);
  const [reportSuccess, setReportSuccess] = useState(false);

  const openReport = (target: ReportTarget) => {
    setReportTarget(target);
    setReportReason("SPAM");
    setReportDescription("");
    setReportSuccess(false);
  };

  const handleSubmitReport = async () => {
    if (!reportTarget || !reportDescription.trim()) return;
    setIsSubmittingReport(true);
    try {
      if (reportTarget.type === "post") {
        await communityApi.reportPost(reportTarget.id, { reason: reportReason, description: reportDescription.trim() });
      } else {
        await communityApi.reportComment(reportTarget.id, { reason: reportReason, description: reportDescription.trim() });
      }
      setReportSuccess(true);
    } catch {
      addToast("신고 제출에 실패했습니다. (이미 신고했을 수 있습니다.)", "error");
    } finally {
      setIsSubmittingReport(false);
    }
  };

  const fetchPost = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await communityApi.getPost(postId);
      setPost(data);
      setLikeCount(data._count?.likes || 0);

      // 댓글 좋아요 초기 카운트 세팅
      const allComments: Comment[] = [
        ...(data.comments || []),
        ...(data.comments || []).flatMap((c: Comment) => c.replies || []),
      ];
      const likesMap: Record<string, { liked: boolean; count: number }> = {};
      allComments.forEach((c: Comment) => {
        likesMap[c.id] = { liked: false, count: c._count?.likes || 0 };
      });
      setCommentLikes(likesMap);

      // 로그인 상태이면 배치 API로 liked 여부 확인
      if (allComments.length > 0) {
        try {
          const likedStatus = await communityApi.getCommentLikedStatus(
            allComments.map((c) => c.id)
          );
          setCommentLikes((prev) => {
            const updated = { ...prev };
            Object.entries(likedStatus).forEach(([id, liked]) => {
              if (updated[id]) updated[id] = { ...updated[id], liked };
            });
            return updated;
          });
        } catch {
          // 비로그인 or 실패 시 무시
        }
      }
    } catch (err: any) {
      setError(err.message || "게시글을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [postId]);

  const checkLikeStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { hasLiked: liked } = await communityApi.hasLikedPost(postId);
      setHasLiked(liked);
    } catch {
      // Ignore error
    }
  }, [postId, isAuthenticated]);

  const checkBookmarkStatus = useCallback(async () => {
    if (!isAuthenticated) return;
    try {
      const { bookmarked } = await communityApi.hasBookmarkedPost(postId);
      setHasBookmarked(bookmarked);
    } catch {
      // Ignore error
    }
  }, [postId, isAuthenticated]);

  useEffect(() => {
    fetchPost();
    checkLikeStatus();
    checkBookmarkStatus();
  }, [fetchPost, checkLikeStatus, checkBookmarkStatus]);

  const handleLike = async () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }

    try {
      if (hasLiked) {
        await communityApi.unlikePost(postId);
        setHasLiked(false);
        setLikeCount((c) => c - 1);
      } else {
        await communityApi.likePost(postId);
        setHasLiked(true);
        setLikeCount((c) => c + 1);
      }
    } catch (err: any) {
      addToast(err.message || "좋아요 처리에 실패했습니다.", "error");
    }
  };

  const handleBookmark = async () => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    try {
      if (hasBookmarked) {
        await communityApi.unbookmarkPost(postId);
        setHasBookmarked(false);
        addToast("북마크가 해제되었습니다.", "info");
      } else {
        await communityApi.bookmarkPost(postId);
        setHasBookmarked(true);
        addToast("북마크에 저장되었습니다.", "success");
      }
    } catch (err: any) {
      addToast(err.message || "북마크 처리에 실패했습니다.", "error");
    }
  };

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !isAuthenticated) return;

    setIsSubmitting(true);
    try {
      await communityApi.createComment(postId, { content: commentText });
      setCommentText("");
      addToast("댓글이 작성되었습니다.", "success");
      fetchPost();
    } catch (err: any) {
      addToast(err.message || "댓글 작성에 실패했습니다.", "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeletePost = async () => {
    try {
      await communityApi.deletePost(postId);
      addToast("게시글이 삭제되었습니다.", "info");
      router.push("/community");
    } catch (err: any) {
      addToast(err.message || "게시글 삭제에 실패했습니다.", "error");
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await communityApi.deleteComment(commentId);
      addToast("댓글이 삭제되었습니다.", "info");
      fetchPost();
    } catch (err: any) {
      addToast(err.message || "댓글 삭제에 실패했습니다.", "error");
    }
  };

  const handleSubmitReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyText.trim() || !isAuthenticated || !replyTo) return;

    setIsSubmittingReply(true);
    try {
      await communityApi.createComment(postId, {
        content: replyText,
        parentId: replyTo.id,
      });
      setReplyText("");
      setReplyTo(null);
      addToast("답글이 작성되었습니다.", "success");
      fetchPost();
    } catch (err: any) {
      addToast(err.message || "답글 작성에 실패했습니다.", "error");
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const handleStartEditComment = (comment: Comment) => {
    setEditingCommentId(comment.id);
    setEditCommentText(comment.content);
  };

  const handleToggleCommentLike = async (commentId: string) => {
    if (!isAuthenticated) {
      router.push("/auth/login");
      return;
    }
    const current = commentLikes[commentId] || { liked: false, count: 0 };
    try {
      if (current.liked) {
        await communityApi.unlikeComment(commentId);
        setCommentLikes((prev) => ({
          ...prev,
          [commentId]: { liked: false, count: prev[commentId].count - 1 },
        }));
      } else {
        await communityApi.likeComment(commentId);
        setCommentLikes((prev) => ({
          ...prev,
          [commentId]: { liked: true, count: (prev[commentId]?.count || 0) + 1 },
        }));
      }
    } catch (err: any) {
      addToast(err.message || "좋아요 처리에 실패했습니다.", "error");
    }
  };

  const handleSubmitEditComment = async (commentId: string) => {
    if (!editCommentText.trim()) return;

    try {
      await communityApi.updateComment(commentId, editCommentText);
      setEditingCommentId(null);
      setEditCommentText("");
      addToast("댓글이 수정되었습니다.", "success");
      fetchPost();
    } catch (err: any) {
      addToast(err.message || "댓글 수정에 실패했습니다.", "error");
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString("ko-KR", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center flex-grow">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="text-text-secondary mt-4">게시글 불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !post) {
    return (
      <div className="flex-grow p-8 text-center">
        <p className="text-accent-danger">{error || "게시글을 찾을 수 없습니다."}</p>
        <Button variant="secondary" className="mt-4" onClick={() => router.push("/community")}>
          목록으로
        </Button>
      </div>
    );
  }

  const isAuthor = user?.id === post.author.id;
  // 게시판(board) 정보 우선, 없으면 레거시 category, 둘 다 없으면 기본값 — null 안전
  const legacyConfig = post.category ? categoryConfig[post.category] : undefined;
  const config = post.board
    ? {
        label: post.board.name,
        icon: resolveBoardIcon(post.board.iconName),
        color: post.board.color ?? "text-text-secondary",
      }
    : (legacyConfig ?? {
        label: "게시판",
        icon: MessageCircle,
        color: "text-text-secondary",
      });
  const CategoryIcon = config.icon;

  return (
    <>
    <div className="flex-grow p-4 md:p-8 animate-fade-in">
      <div className="container mx-auto max-w-3xl">
        {/* Back Button */}
        <Button
          variant="ghost"
          className="mb-4"
          onClick={() => router.push("/community")}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          목록으로
        </Button>

        {/* Post */}
        <Card className="mb-6 p-0">
          <CardContent className="p-4 md:p-6">
            {/* Category & Title */}
            <div className="flex items-center gap-2 mb-3">
              <Badge
                variant={post.category === "NOTICE" ? "danger" : "default"}
                className="flex items-center gap-1"
              >
                <CategoryIcon className={`h-3 w-3 ${config.color}`} />
                {config.label}
              </Badge>
              {post.isPinned && <Badge variant="primary">고정</Badge>}
            </div>
            <h1 className="text-2xl font-bold text-text-primary mb-4">
              {post.title}
            </h1>

            {/* Author & Meta */}
            <div className="flex items-center justify-between mb-6 pb-6 border-b border-bg-tertiary">
              <button
                className="flex items-center gap-3 group"
                onClick={() => router.push(`/users/${post.author.id}`)}
              >
                <div className="relative w-10 h-10 rounded-full bg-bg-tertiary overflow-hidden group-hover:ring-2 group-hover:ring-accent-primary/50 transition-all">
                  {post.author.avatar ? (
                    <Image
                      src={post.author.avatar}
                      alt={post.author.username}
                      fill
                      className="object-cover"
                      unoptimized
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center">
                      <User className="h-5 w-5 text-text-tertiary" />
                    </div>
                  )}
                </div>
                <div className="text-left">
                  <p className="font-medium text-text-primary group-hover:text-accent-primary transition-colors">
                    {post.author.username}
                  </p>
                  <p className="text-xs text-text-tertiary flex items-center gap-2">
                    <Clock className="h-3 w-3" />
                    {formatDate(post.createdAt)}
                    {post.isEdited && <span>(수정됨)</span>}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-3 text-sm text-text-tertiary">
                <span className="flex items-center gap-1">
                  <Eye className="h-4 w-4" />
                  {post.views}
                </span>
              </div>
            </div>

            {/* Content — 블라인드 처리된 게시글은 경고 메시지로 대체 */}
            {post.isBlinded ? (
              <div className="flex items-center gap-3 p-4 mb-6 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400">
                <span className="text-lg">⚠️</span>
                <p className="text-sm font-medium">이 게시글은 신고에 의해 임시조치 처리되었습니다.</p>
              </div>
            ) : (
              <div className="prose prose-invert max-w-none mb-6">
                {post.contentFormat === "RICHTEXT" && post.contentJson ? (
                  <RichTextViewer content={post.contentJson} />
                ) : (
                  <MarkdownViewer content={post.content} />
                )}
              </div>
            )}

            {/* Tags */}
            {post.tags && post.tags.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-6">
                {post.tags.map(({ tag }) => (
                  <button
                    key={tag.name}
                    onClick={() => router.push(`/community?tag=${tag.name}`)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-accent-primary/10 text-accent-primary text-sm hover:bg-accent-primary/20 transition-colors"
                  >
                    <Tag className="h-3 w-3" />
                    {tag.name}
                  </button>
                ))}
              </div>
            )}

            {/* Actions — 좁은 화면에서는 자연스럽게 다음 줄로 넘어가도록 wrap */}
            <div className="flex flex-wrap items-center justify-between gap-y-2 pt-6 border-t border-bg-tertiary">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={hasLiked ? "primary" : "secondary"}
                  size="sm"
                  onClick={handleLike}
                >
                  <Heart
                    className={`h-4 w-4 mr-2 ${hasLiked ? "fill-current" : ""}`}
                  />
                  좋아요 {likeCount}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(window.location.href);
                    addToast("링크가 복사되었습니다.", "success");
                  }}
                >
                  <Link className="h-4 w-4 mr-1" />
                  공유
                </Button>
                <Button
                  variant={hasBookmarked ? "primary" : "ghost"}
                  size="sm"
                  onClick={handleBookmark}
                >
                  <Bookmark className={`h-4 w-4 mr-1 ${hasBookmarked ? "fill-current" : ""}`} />
                  {hasBookmarked ? "저장됨" : "저장"}
                </Button>
                {/* 본인 글 아닐 때만 신고 버튼 표시 */}
                {isAuthenticated && !isAuthor && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => openReport({ type: "post", id: postId })}
                    className="text-text-tertiary hover:text-red-400"
                  >
                    <Flag className="h-4 w-4 mr-1" />
                    신고
                  </Button>
                )}
              </div>
              {isAuthor && (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/community/${postId}/edit`)}
                  >
                    <Edit className="h-4 w-4 mr-1" />
                    수정
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeletePostConfirm(true)}>
                    <Trash2 className="h-4 w-4 mr-1" />
                    삭제
                  </Button>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Comments */}
        <Card className="p-0">
          <CardContent className="p-4 md:p-6">
            <h3 className="font-semibold text-text-primary mb-4 flex items-center gap-2">
              <MessageCircle className="h-5 w-5" />
              댓글 ({post.comments.length})
            </h3>

            {/* Comment Form */}
            {isAuthenticated ? (
              <form onSubmit={handleSubmitComment} className="mb-6">
                <div className="flex gap-2">
                  <Input
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="댓글을 입력하세요..."
                    className="flex-grow"
                  />
                  <Button type="submit" disabled={isSubmitting || !commentText.trim()}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            ) : (
              <p className="text-text-tertiary text-sm mb-6">
                댓글을 작성하려면{" "}
                <button
                  onClick={() => router.push("/auth/login")}
                  className="text-accent-primary hover:underline"
                >
                  로그인
                </button>
                하세요.
              </p>
            )}

            {/* Comments List */}
            {post.comments.length === 0 ? (
              <p className="text-text-tertiary text-center py-8">
                아직 댓글이 없습니다. 첫 댓글을 남겨보세요!
              </p>
            ) : (
              <div className="space-y-4">
                {post.comments.map((comment) => (
                  <div key={comment.id}>
                    {/* 최상위 댓글 */}
                    <div className="group flex gap-3 p-4 rounded-lg bg-bg-tertiary/50">
                      <div className="relative w-8 h-8 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
                        {comment.author.avatar ? (
                          <Image
                            src={comment.author.avatar}
                            alt={comment.author.username}
                            fill
                            className="object-cover"
                            unoptimized
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <User className="h-4 w-4 text-text-tertiary" />
                          </div>
                        )}
                      </div>
                      <div className="flex-grow">
                        <div className="flex items-center justify-between mb-1">
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-text-primary text-sm">
                              {comment.author.username}
                            </p>
                            <p className="text-xs text-text-tertiary">
                              {formatDate(comment.createdAt)}
                            </p>
                            {comment.isEdited && (
                              <span className="text-xs text-text-tertiary">(수정됨)</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1">
                            {/* 좋아요 */}
                            <button
                              onClick={() => handleToggleCommentLike(comment.id)}
                              className={`flex items-center gap-1 text-xs px-1.5 py-0.5 rounded transition-colors ${
                                commentLikes[comment.id]?.liked
                                  ? "text-accent-primary"
                                  : "text-text-tertiary hover:text-accent-primary"
                              }`}
                            >
                              <ThumbsUp className={`h-3 w-3 ${commentLikes[comment.id]?.liked ? "fill-current" : ""}`} />
                              {(commentLikes[comment.id]?.count || 0) > 0 && (
                                <span>{commentLikes[comment.id]?.count}</span>
                              )}
                            </button>
                            {isAuthenticated && (
                              <button
                                onClick={() =>
                                  replyTo?.id === comment.id
                                    ? setReplyTo(null)
                                    : setReplyTo({ id: comment.id, username: comment.author.username })
                                }
                                className="text-xs text-text-tertiary hover:text-accent-primary flex items-center gap-1 ml-1"
                              >
                                <CornerDownRight className="h-3 w-3" />
                                답글
                              </button>
                            )}
                            {user?.id === comment.author.id ? (
                              <>
                                <button
                                  onClick={() => handleStartEditComment(comment)}
                                  className="text-text-tertiary hover:text-accent-primary ml-1"
                                >
                                  <Edit className="h-4 w-4" />
                                </button>
                                <button
                                  onClick={() => setDeleteCommentId(comment.id)}
                                  className="text-text-tertiary hover:text-accent-danger ml-1"
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </>
                            ) : isAuthenticated && (
                              /* 본인 댓글 아닐 때만 신고 버튼 (hover 시 표시) */
                              <button
                                onClick={() => openReport({ type: "comment", id: comment.id, authorName: comment.author.username })}
                                title="댓글 신고"
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-red-400 ml-1"
                              >
                                <Flag className="h-4 w-4" />
                              </button>
                            )}
                          </div>
                        </div>
                        {/* 블라인드 처리된 댓글은 경고 메시지 표시 */}
                        {comment.isBlinded ? (
                          <p className="text-xs text-yellow-500/80 italic">[블라인드 처리된 댓글입니다]</p>
                        ) : editingCommentId === comment.id ? (
                          <div className="flex gap-2 mt-1">
                            <input
                              value={editCommentText}
                              onChange={(e) => setEditCommentText(e.target.value)}
                              className="flex-grow text-sm px-2 py-1 bg-bg-secondary border border-bg-elevated rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                            />
                            <button
                              onClick={() => handleSubmitEditComment(comment.id)}
                              className="text-accent-primary hover:text-accent-primary/80"
                            >
                              <Check className="h-4 w-4" />
                            </button>
                            <button
                              onClick={() => setEditingCommentId(null)}
                              className="text-text-tertiary hover:text-text-primary"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <p className="text-text-secondary text-sm">{comment.content}</p>
                        )}
                      </div>
                    </div>

                    {/* 답글 입력폼 */}
                    {replyTo?.id === comment.id && (
                      <div className="ml-8 mt-2">
                        <form onSubmit={handleSubmitReply} className="flex gap-2">
                          <div className="flex items-center text-text-tertiary mr-1">
                            <CornerDownRight className="h-4 w-4" />
                          </div>
                          <input
                            value={replyText}
                            onChange={(e) => setReplyText(e.target.value)}
                            placeholder={`${replyTo.username}에게 답글...`}
                            className="flex-grow text-sm px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingReply || !replyText.trim()}
                            className="px-3 py-2 bg-accent-primary text-white rounded-lg text-sm disabled:opacity-50"
                          >
                            <Send className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => { setReplyTo(null); setReplyText(""); }}
                            className="px-2 py-2 text-text-tertiary hover:text-text-primary"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </form>
                      </div>
                    )}

                    {/* 대댓글 목록 */}
                    {comment.replies && comment.replies.length > 0 && (
                      <div className="ml-8 mt-2 space-y-2">
                        {comment.replies.map((reply) => (
                          <div
                            key={reply.id}
                            className="group flex gap-3 p-3 rounded-lg bg-bg-secondary/50 border-l-2 border-accent-primary/30"
                          >
                            <div className="text-text-tertiary flex-shrink-0 mt-1">
                              <CornerDownRight className="h-3 w-3" />
                            </div>
                            <div className="relative w-6 h-6 rounded-full bg-bg-tertiary overflow-hidden flex-shrink-0">
                              {reply.author.avatar ? (
                                <Image
                                  src={reply.author.avatar}
                                  alt={reply.author.username}
                                  fill
                                  className="object-cover"
                                  unoptimized
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center">
                                  <User className="h-3 w-3 text-text-tertiary" />
                                </div>
                              )}
                            </div>
                            <div className="flex-grow">
                              <div className="flex items-center justify-between mb-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-text-primary text-sm">
                                    {reply.author.username}
                                  </p>
                                  <p className="text-xs text-text-tertiary">
                                    {formatDate(reply.createdAt)}
                                  </p>
                                  {reply.isEdited && (
                                    <span className="text-xs text-text-tertiary">(수정됨)</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-1">
                                  {/* 대댓글 좋아요 */}
                                  <button
                                    onClick={() => handleToggleCommentLike(reply.id)}
                                    className={`flex items-center gap-1 text-xs px-1 py-0.5 rounded transition-colors ${
                                      commentLikes[reply.id]?.liked
                                        ? "text-accent-primary"
                                        : "text-text-tertiary hover:text-accent-primary"
                                    }`}
                                  >
                                    <ThumbsUp className={`h-3 w-3 ${commentLikes[reply.id]?.liked ? "fill-current" : ""}`} />
                                    {(commentLikes[reply.id]?.count || 0) > 0 && (
                                      <span>{commentLikes[reply.id]?.count}</span>
                                    )}
                                  </button>
                                  {user?.id === reply.author.id ? (
                                    <>
                                      <button
                                        onClick={() => handleStartEditComment(reply)}
                                        className="text-text-tertiary hover:text-accent-primary ml-1"
                                      >
                                        <Edit className="h-4 w-4" />
                                      </button>
                                      <button
                                        onClick={() => setDeleteCommentId(reply.id)}
                                        className="text-text-tertiary hover:text-accent-danger ml-1"
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </button>
                                    </>
                                  ) : isAuthenticated && (
                                    <button
                                      onClick={() => openReport({ type: "comment", id: reply.id, authorName: reply.author.username })}
                                      title="댓글 신고"
                                      className="opacity-0 group-hover:opacity-100 transition-opacity text-text-tertiary hover:text-red-400 ml-1"
                                    >
                                      <Flag className="h-4 w-4" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {/* 블라인드 처리된 대댓글은 경고 메시지 표시 */}
                              {reply.isBlinded ? (
                                <p className="text-xs text-yellow-500/80 italic">[블라인드 처리된 댓글입니다]</p>
                              ) : editingCommentId === reply.id ? (
                                <div className="flex gap-2 mt-1">
                                  <input
                                    value={editCommentText}
                                    onChange={(e) => setEditCommentText(e.target.value)}
                                    className="flex-grow text-sm px-2 py-1 bg-bg-secondary border border-bg-elevated rounded text-text-primary focus:outline-none focus:ring-1 focus:ring-accent-primary"
                                  />
                                  <button
                                    onClick={() => handleSubmitEditComment(reply.id)}
                                    className="text-accent-primary hover:text-accent-primary/80"
                                  >
                                    <Check className="h-4 w-4" />
                                  </button>
                                  <button
                                    onClick={() => setEditingCommentId(null)}
                                    className="text-text-tertiary hover:text-text-primary"
                                  >
                                    <X className="h-4 w-4" />
                                  </button>
                                </div>
                              ) : (
                                <p className="text-text-secondary text-sm">{reply.content}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>

    {/* 신고 모달 */}
    {reportTarget && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
        <div className="bg-bg-secondary border border-bg-elevated rounded-xl w-full max-w-sm shadow-xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-bg-tertiary">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Flag className="h-4 w-4 text-red-400" />
              {reportTarget.type === "post" ? "게시글 신고" : "댓글 신고"}
            </h3>
            <button onClick={() => setReportTarget(null)} className="p-1 rounded hover:bg-bg-elevated text-text-tertiary">
              <X className="h-4 w-4" />
            </button>
          </div>

          {reportSuccess ? (
            <div className="p-6 text-center">
              <p className="text-sm text-text-primary font-medium mb-1">신고가 접수되었습니다</p>
              <p className="text-xs text-text-tertiary mb-4">운영팀이 검토 후 조치할 예정입니다.</p>
              <button
                onClick={() => setReportTarget(null)}
                className="px-4 py-2 text-sm bg-accent-primary text-white rounded-lg hover:bg-accent-hover"
              >
                확인
              </button>
            </div>
          ) : (
            <div className="p-4 space-y-4">
              {reportTarget.type === "comment" && (
                <p className="text-xs text-text-tertiary bg-bg-tertiary rounded-lg px-3 py-2">
                  <span className="text-text-secondary font-medium">{(reportTarget as any).authorName}</span>님의 댓글을 신고합니다.
                </p>
              )}
              {/* 신고 사유 */}
              <div>
                <label className="text-xs text-text-tertiary mb-1.5 block">신고 사유</label>
                <div className="space-y-1.5">
                  {REPORT_REASONS.map((r) => (
                    <label key={r.value} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="reportReason"
                        value={r.value}
                        checked={reportReason === r.value}
                        onChange={() => setReportReason(r.value)}
                        className="accent-accent-primary"
                      />
                      <span className="text-sm text-text-secondary">{r.label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {/* 상세 설명 */}
              <div>
                <label className="text-xs text-text-tertiary mb-1.5 block">
                  상세 설명 <span className="text-red-400">*</span>
                </label>
                <textarea
                  value={reportDescription}
                  onChange={(e) => setReportDescription(e.target.value)}
                  placeholder="신고 내용을 구체적으로 작성해주세요."
                  maxLength={500}
                  rows={3}
                  className="w-full px-3 py-2 bg-bg-tertiary border border-bg-elevated rounded-lg text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none focus:ring-2 focus:ring-accent-primary resize-none"
                />
                <p className="text-xs text-text-tertiary text-right mt-1">{reportDescription.length}/500</p>
              </div>
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => setReportTarget(null)}
                  className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary bg-bg-tertiary rounded-lg"
                >
                  취소
                </button>
                <button
                  onClick={handleSubmitReport}
                  disabled={isSubmittingReport || !reportDescription.trim()}
                  className="px-3 py-2 text-sm bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isSubmittingReport ? "신고 중..." : "신고하기"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}

    <ConfirmModal
      isOpen={deletePostConfirm}
      onClose={() => setDeletePostConfirm(false)}
      onConfirm={handleDeletePost}
      title="게시글 삭제"
      message="정말로 이 게시글을 삭제하시겠습니까? 삭제된 게시글은 복구할 수 없습니다."
      confirmText="삭제"
      variant="danger"
    />
    <ConfirmModal
      isOpen={deleteCommentId !== null}
      onClose={() => setDeleteCommentId(null)}
      onConfirm={() => { if (deleteCommentId) handleDeleteComment(deleteCommentId); }}
      title="댓글 삭제"
      message="정말로 이 댓글을 삭제하시겠습니까?"
      confirmText="삭제"
      variant="danger"
    />
    </>
  );
}
