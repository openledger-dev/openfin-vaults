"use client";

import { useEffect, useState } from "react";
import { AppTopNav } from "./AppTopNav";
import { AppSidebar } from "./AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileMenuOpen]);

  return (
    <div className="min-h-screen">
      <AppTopNav onMenuClick={() => setMobileMenuOpen(true)} />
      <AppSidebar
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
      />
      <div className="pt-16 lg:pl-64">
        <main className="min-h-[calc(100vh-4rem)] bg-white dark:bg-[#0F1116]">{children}</main>
      </div>
    </div>
  );
}
