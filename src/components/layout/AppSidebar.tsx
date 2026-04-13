"use client";

import type { IconType } from "react-icons";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { HiOutlineBriefcase, HiOutlineCube } from "react-icons/hi";

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
      ? "bg-[#F1F2F0] text-zinc-900"
      : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900")
  );
}

function iconClass(active: boolean): string {
  return (
    "h-6 w-6 shrink-0 " +
    (active ? "text-zinc-900" : "text-zinc-500 group-hover:text-zinc-800")
  );
}

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed bottom-0 left-0 top-16 z-40 flex w-64 flex-col !border-r !border-[#F2F2F2] bg-white"
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
  );
}
