"use client";

import React from "react";
import { useAccount } from "wagmi";
import { Navbar } from "@/components/Navbar";
import { StatsBar } from "@/components/StatsBar";
import { UserPositionsPanel } from "@/components/UserPositionsPanel";
import { VaultsTable } from "@/components/VaultsTable";
import { useVaultData } from "@/hooks/useVaultData";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";

export default function HomePage() {
  const { address: userAddress } = useAccount();
  const { vaults, isLoading } = useVaultData(VAULT_PLATFORMS, userAddress);

  return (
    <div style={{ minHeight: "100vh", background: "#161616" }}>
      <Navbar />
      <div style={{ paddingTop: "3rem" }}>
        <StatsBar vaults={vaults} isLoading={isLoading} />
        <main style={{ maxWidth: "1400px", margin: "0 auto", padding: "2rem 2rem 4rem" }}>
          <section style={{ marginBottom: "2.5rem" }}>
            <UserPositionsPanel vaults={vaults} isLoading={isLoading} />
          </section>
          <section>
            <VaultsTable vaults={vaults} isLoading={isLoading} />
          </section>
        </main>
      </div>
    </div>
  );
}
