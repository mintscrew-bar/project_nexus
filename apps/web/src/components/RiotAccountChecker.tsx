"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useRiotStore } from '@/stores/riot-store';
import { AddAccountModal } from '@/components/domain/AddAccountModal';
import { gameFromSlug } from '@nexus/types';

export function RiotAccountChecker({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();
  const { fetchAccounts } = useRiotStore();

  const [showModal, setShowModal] = useState(false);
  const [checked, setChecked] = useState(false);

  // Riot 계정 안내는 롤 화면에서만 표시한다. 배그와 공통 화면은 제외한다.
  const shouldSkip = gameFromSlug(pathname.split('/')[1]) !== 'LOL';

  useEffect(() => {
    const checkRiotAccount = async () => {
      if (!isAuthenticated || shouldSkip || checked) return;

      await fetchAccounts();

      const freshAccounts = useRiotStore.getState().accounts;
      if (!freshAccounts || freshAccounts.length === 0) {
        // sessionStorage: 탭/브라우저 닫으면 초기화 → 로그인 세션마다 표시
        const dismissedKey = `riot-modal-dismissed-${user?.id}`;
        const dismissed = sessionStorage.getItem(dismissedKey);
        if (!dismissed) {
          setShowModal(true);
        }
      }

      setChecked(true);
    };

    if (isAuthenticated) {
      checkRiotAccount();
    }
  }, [isAuthenticated, shouldSkip, checked, fetchAccounts, user?.id]);

  useEffect(() => {
    setChecked(false);
  }, [user?.id]);

  return (
    <>
      {children}

      <AddAccountModal
        isOpen={showModal && !shouldSkip && isAuthenticated}
        onClose={() => {
          setShowModal(false);
          if (user?.id) {
            sessionStorage.setItem(`riot-modal-dismissed-${user.id}`, 'true');
          }
        }}
        onAccountAdded={() => {
          fetchAccounts();
          setShowModal(false);
        }}
      />
    </>
  );
}
