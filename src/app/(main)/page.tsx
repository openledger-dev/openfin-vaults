"use client";

import React from "react";
import { useAccount } from "wagmi";
import { StatsBar } from "@/components/StatsBar";
import { VaultsTable } from "@/components/VaultsTable";
import { useVaultData } from "@/hooks/useVaultData";
import { VAULT_PLATFORMS } from "@/lib/vaultConfig";

export default function HomePage() {
  const { address: userAddress } = useAccount();
  const { vaults, isLoading } = useVaultData(VAULT_PLATFORMS, userAddress);

  return (
    <div className="min-h-full bg-white">
      <div className="mx-auto w-full p-4 lg:p-6">
        <StatsBar vaults={vaults} isLoading={isLoading} />
        <div className="mt-8">
        <VaultsTable vaults={vaults} isLoading={isLoading} />
        </div>
      </div>
    </div>
  );
}
