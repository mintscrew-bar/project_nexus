const owners = new Set<symbol>();
let previousOverflow = '';

export function acquireBodyScrollLock(owner: symbol) {
  if (typeof document === 'undefined' || owners.has(owner)) return;
  if (owners.size === 0) {
    previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  owners.add(owner);
}

export function releaseBodyScrollLock(owner: symbol) {
  if (typeof document === 'undefined' || !owners.delete(owner)) return;
  if (owners.size === 0) {
    document.body.style.overflow = previousOverflow;
    previousOverflow = '';
  }
}
