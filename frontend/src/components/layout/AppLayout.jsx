import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar.jsx';
import { TopHeader } from './TopHeader.jsx';
import { SimulationNotice } from './SimulationNotice.jsx';
import { CommandPalette } from './CommandPalette.jsx';
import { HypothesisModal } from '../common/HypothesisModal.jsx';
import { ToastContainer } from '../common/ToastContainer.jsx';

export const AppLayout = () => {
  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#030407] text-[#e2e2e9]">
      {/* Sidebar Navigation */}
      <Sidebar />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Disclaimer / Demo Control Bar */}
        <SimulationNotice />

        {/* Global Header */}
        <TopHeader />

        {/* Dynamic Route Pages */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 bg-[#030407]">
          <div className="max-w-7xl mx-auto w-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Global Modals & Notifications */}
      <CommandPalette />
      <HypothesisModal />
      <ToastContainer />
    </div>
  );
};

export default AppLayout;

