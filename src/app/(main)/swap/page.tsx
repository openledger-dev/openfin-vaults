"use client";

import { SwapContent } from "@/components/NearSwapModal";

export default function SwapPage() {
  return (
    <div className="min-h-full bg-white dark:bg-[#000000]">
      <div className="mx-auto w-full p-4 lg:p-6">
        <SwapContent />
      </div>
    </div>
  );
}
