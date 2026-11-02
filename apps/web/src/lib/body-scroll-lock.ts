/**
 * body 스크롤 잠금 (모바일 메뉴·모달 공용).
 *
 * **인라인 style 이 아니라 클래스로 건다.**
 * 전에는 `body.style.overflow = "hidden"` 을 썼다. 그런데 구글 자동광고의
 * 비넷(전면 광고)이 링크 클릭을 가로챌 때 body 의 style 속성을 통째로 저장했다가
 * 광고를 닫으면 되돌린다. 모바일 메뉴에서 링크를 누르면 그 순간 잠금이 걸린
 * style 이 저장되고, 메뉴가 닫히며 잠금을 푼 **뒤에** 광고가 그 값을 되살려서
 * 도착한 페이지가 통째로 스크롤되지 않았다 (2026-11-02, 안드로이드 로그인 상태에서
 * 전적 페이지 제보 → 운영에서 3회 연속 재현).
 * 클래스는 광고가 저장·복원하는 style 속성 밖이라 이 경쟁에 휘말리지 않는다.
 * 규칙은 globals.css 의 `body.scroll-locked`.
 */
const LOCK_CLASS = "scroll-locked";
const owners = new Set<symbol>();

export function acquireBodyScrollLock(owner: symbol) {
  if (typeof document === "undefined" || owners.has(owner)) return;
  owners.add(owner);
  document.body.classList.add(LOCK_CLASS);
}

export function releaseBodyScrollLock(owner: symbol) {
  if (typeof document === "undefined" || !owners.delete(owner)) return;
  if (owners.size === 0) document.body.classList.remove(LOCK_CLASS);
}
