"use client";

import { AppTopNav } from "./AppTopNav";
import { AppSidebar } from "./AppSidebar";

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <AppTopNav />
      <AppSidebar />
      <div className="pl-64 pt-16">
        <main className="min-h-[calc(100vh-4rem)] bg-white">{children}</main>
      </div>
    </div>
  );
}
