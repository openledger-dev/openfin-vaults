"use client";

import type { IconType } from "react-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  HiOutlineBriefcase,
  HiOutlineCube,
  HiOutlineDocumentText,
  HiOutlineShieldCheck,
  HiOutlineSwitchHorizontal,
  HiOutlineX,
} from "react-icons/hi";

type NavItem = {
  href: string;
  label: string;
  Icon: IconType;
  match: (path: string) => boolean;
};

const mainNav: NavItem[] = [
  {
    href: "/",
    label: "Vaults",
    Icon: HiOutlineCube,
    match: (p) => p === "/" || p.startsWith("/vaults/"),
  },
  {
    href: "/portfolio",
    label: "Portfolio",
    Icon: HiOutlineBriefcase,
    match: (p) => p.startsWith("/portfolio"),
  },
  {
    href: "/swap",
    label: "Swap",
    Icon: HiOutlineSwitchHorizontal,
    match: (p) => p.startsWith("/swap"),
  },
];

const legalNav: NavItem[] = [
  {
    href: "/privacy-policy",
    label: "Privacy Policy",
    Icon: HiOutlineShieldCheck,
    match: (p) => p.startsWith("/privacy-policy"),
  },
  {
    href: "/terms-of-use",
    label: "Terms of Use",
    Icon: HiOutlineDocumentText,
    match: (p) => p.startsWith("/terms-of-use"),
  },
];

function navLinkClass(active: boolean): string {
  return (
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors " +
    (active
      ? "bg-[#F1F2F0] text-zinc-900 dark:bg-[#141417] dark:text-[#ffffff]"
      : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-[#afafb2] dark:hover:bg-[#141417] dark:hover:text-[#ffffff]")
  );
}

function iconClass(active: boolean): string {
  return (
    "h-6 w-6 shrink-0 " +
    (active ? "text-zinc-900 dark:text-[#ffffff]" : "text-zinc-500 group-hover:text-zinc-800 dark:text-[#afafb2] dark:group-hover:text-[#ffffff]")
  );
}

interface AppSidebarProps {
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function AppSidebar({ mobileOpen, onCloseMobile }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <>
      {/* ── Desktop sidebar ── */}
      <aside
        className="fixed bottom-0 left-0 top-16 z-40 hidden w-64 flex-col border-r border-[#F2F2F2] bg-white dark:border-[#1b1b1f] dark:bg-[#000000] xl:flex"
        aria-label="Sidebar"
      >
        <nav className="flex flex-1 flex-col gap-0.5 p-3 pt-4" aria-label="App sections">
          {mainNav.map(({ href, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={`group ${navLinkClass(active)}`}
              >
                <Icon className={iconClass(active)} aria-hidden strokeWidth={2} />
                <span>{label}</span>
              </Link>
            );
          })}

          <div className="mt-auto rounded-xl border border-[#F2F2F2] bg-[#F7F7F7] p-2 dark:border-[#1b1b1f] dark:bg-[#0d0d10]">
            <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Legal
            </p>
            <div className="flex flex-col gap-0.5">
              {legalNav.map(({ href, label, Icon, match }) => {
                const active = match(pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`group ${navLinkClass(active)}`}
                  >
                    <Icon className={iconClass(active)} aria-hidden strokeWidth={2} />
                    <span>{label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </nav>
      </aside>

      {/* ── Mobile sidebar ── */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[70] xl:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-black/30"
            onClick={onCloseMobile}
          />
          <aside className="absolute bottom-0 left-0 top-0 w-[82vw] max-w-[20rem] overflow-y-auto rounded-r-2xl border-r border-[#F2F2F2] bg-white shadow-2xl dark:border-[#1b1b1f] dark:bg-[#000000]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#F2F2F2] bg-white px-4 py-3 dark:border-[#1b1b1f] dark:bg-[#000000]">
              <p className="text-sm font-semibold text-zinc-900 dark:text-[#ffffff]">Menu</p>
              <button
                type="button"
                onClick={onCloseMobile}
                className="rounded-md p-1 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-[#afafb2] dark:hover:bg-[#141417] dark:hover:text-[#ffffff]"
                aria-label="Close menu"
              >
                <HiOutlineX className="h-5 w-5" />
              </button>
            </div>
            <nav className="flex flex-col gap-1 p-3 pt-4" aria-label="Mobile app sections">
              {mainNav.map(({ href, label, Icon, match }) => {
                const active = match(pathname);
                return (
                  <Link
                    key={href}
                    href={href}
                    className={`group ${navLinkClass(active)}`}
                    onClick={onCloseMobile}
                  >
                    <Icon className={iconClass(active)} aria-hidden strokeWidth={2} />
                    <span>{label}</span>
                  </Link>
                );
              })}
              <div className="mt-3 rounded-xl border border-[#F2F2F2] bg-[#F7F7F7] p-2 dark:border-[#1b1b1f] dark:bg-[#0d0d10]">
                <p className="px-2 pb-1 text-[0.625rem] font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Legal
                </p>
                {legalNav.map(({ href, label, Icon, match }) => {
                  const active = match(pathname);
                  return (
                    <Link
                      key={href}
                      href={href}
                      className={`group ${navLinkClass(active)}`}
                      onClick={onCloseMobile}
                    >
                      <Icon className={iconClass(active)} aria-hidden strokeWidth={2} />
                      <span>{label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
