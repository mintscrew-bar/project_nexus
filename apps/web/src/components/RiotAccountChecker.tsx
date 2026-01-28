"use client";

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { useRiotStore } from '@/stores/riot-store';
import { AddAccountModal } from '@/components/domain/AddAccountModal'; // Use the new consolidated modal

const SKIP_PATHS = ['/auth', '/'];

export function RiotAccountChecker({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, user } = useAuthStore();
  const { accounts, fetchAccounts } = useRiotStore();

  const [showModal, setShowModal] = useState(false);
  const [checked, setChecked] = useState(false);

  // Skip checking on certain paths
  const shouldSkip = SKIP_PATHS.some(path => pathname.startsWith(path));

  useEffect(() => {
    const checkRiotAccount = async () => {
      if (!isAuthenticated || shouldSkip || checked) return;

      // Ensure accounts are loaded in the store
      await fetchAccounts();

      // If no accounts, show modal. This relies on the store being up to date.
      if (!accounts || accounts.length === 0) {
        // Check if user already dismissed this session
        const dismissed = sessionStorage.getItem('riot-modal-dismissed');
        if (!dismissed) {
          setShowModal(true);
        }
      }

      setChecked(true);
    };

    if (isAuthenticated) {
      checkRiotAccount();
    }
  }, [isAuthenticated, shouldSkip, checked, fetchAccounts, accounts]);

  // Reset checked state when user changes
  useEffect(() => {
    setChecked(false);
  }, [user?.id]);

  return (
    <>
      {children}

      <AddAccountModal
        isOpen={showModal}
        onClose={() => {
          setShowModal(false);
          sessionStorage.setItem('riot-modal-dismissed', 'true');
        }}
        onAccountAdded={() => {
          fetchAccounts(); // Re-fetch accounts to update the state
          setShowModal(false);
        }}
      />
    </>
  );
}
