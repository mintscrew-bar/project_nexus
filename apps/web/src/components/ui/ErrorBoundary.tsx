"use client";

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** 에러 발생 시 대체 UI — 미지정 시 빈 영역 렌더링 */
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * 자식 컴포넌트 렌더링 에러를 캐치하여 전체 페이지 crash를 방지.
 * class 컴포넌트 — React의 getDerivedStateFromError / componentDidCatch는
 * 아직 함수 컴포넌트에서 사용 불가.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? null;
    }
    return this.props.children;
  }
}
