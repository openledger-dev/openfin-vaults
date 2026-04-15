"use client";

import type { IconType } from "react-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HiOutlineBriefcase, HiOutlineCube, HiOutlineX } from "react-icons/hi";

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
      <aside
        className="fixed bottom-0 left-0 top-16 z-40 hidden w-64 flex-col border-r border-[#F2F2F2] bg-white dark:border-[#1b1b1f] dark:bg-[#000000] lg:flex"
        aria-label="Sidebar"
      >
        <nav className="flex flex-col gap-0.5 p-3 pt-4" aria-label="App sections">
          {mainNav.map(({ href, label, Icon, match }) => {
            const active = match(pathname);
            return (
              <Link
                key={href}
                href={href}
                className={`group ${navLinkClass(active)}`}
                onClick={onCloseMobile}
              >
                <Icon
                  className={iconClass(active)}
                  aria-hidden
                  strokeWidth={2}
                />
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-[70] lg:hidden">
          <button
            type="button"
            aria-label="Close menu overlay"
            className="absolute inset-0 bg-black/30"
            onClick={onCloseMobile}
          />
          <aside className="absolute bottom-0 left-0 top-0 w-[82vw] max-w-[320px] overflow-y-auto rounded-r-2xl border-r border-[#F2F2F2] bg-white shadow-2xl dark:border-[#1b1b1f] dark:bg-[#000000]">
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
            </nav>
          </aside>
        </div>
      )}
    </>
  );
}
