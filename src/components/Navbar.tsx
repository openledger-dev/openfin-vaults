"use client";

import React from "react";
import { usePathname } from "next/navigation";
import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
} from "@carbon/react";
import { useAppKit, useAppKitAccount } from "@reown/appkit/react";

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function Navbar() {
  const { open } = useAppKit();
  const { address, isConnected } = useAppKitAccount();
  const pathname = usePathname();

  const isVaults = pathname === "/" || pathname.startsWith("/vaults");

  return (
    <Header aria-label="VaultAgent">
      <HeaderName href="/" prefix="">
        <span style={{ fontWeight: 700, letterSpacing: "0.02em" }}>
          Vault<span style={{ color: "#4589ff" }}>Agent</span>
        </span>
      </HeaderName>

      <HeaderNavigation aria-label="Main navigation">
        <HeaderMenuItem href="/" isCurrentPage={isVaults}>
          Vaults
        </HeaderMenuItem>
        <HeaderMenuItem href="/portfolio" isCurrentPage={pathname === "/portfolio"}>Portfolio</HeaderMenuItem>
        <HeaderMenuItem href="/analytics" isCurrentPage={pathname === "/analytics"}>Analytics</HeaderMenuItem>
      </HeaderNavigation>

      <HeaderGlobalBar>
        <button
          type="button"
          onClick={() => open()}
          style={{
            background: "transparent",
            border: "1px solid #393939",
            borderRadius: "2px",
            padding: "0 1rem",
            height: "3rem",
            minWidth: "160px",
            fontSize: "0.875rem",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            marginRight: "0.5rem",
          }}
        >
          {isConnected && address ? (
            <span style={{ color: "#4589ff", fontWeight: 600 }}>
              {shortenAddress(address)}
            </span>
          ) : (
            <span style={{ color: "#c6c6c6" }}>Connect Wallet</span>
          )}
        </button>
      </HeaderGlobalBar>
    </Header>
  );
}
