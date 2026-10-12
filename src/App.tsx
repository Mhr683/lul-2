/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { StorefrontView } from './components/StorefrontView';
import { AdminDashboardView } from './components/AdminDashboardView';

const MainRouter: React.FC = () => {
  const [mode, setMode] = useState<'STOREFRONT' | 'ADMIN'>('STOREFRONT');
  const { toastMessage } = useStore();

  return (
    <div className="relative min-h-screen">
      {mode === 'STOREFRONT' ? (
        <StorefrontView onOpenAdmin={() => setMode('ADMIN')} />
      ) : (
        <AdminDashboardView onReturnToStore={() => setMode('STOREFRONT')} />
      )}

      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-5 right-5 z-50 px-5 py-3 bg-[#141413] text-[#FBFBF9] border border-white/15 text-xs font-medium shadow-lg"
        >
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <MainRouter />
    </StoreProvider>
  );
}
