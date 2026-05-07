export default function PrivacyPolicyPage() {
  return (
    <div className="min-h-full bg-white dark:bg-[#000000]">
      <div className="mx-auto w-full max-w-4xl p-4 lg:p-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Privacy Policy</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Last updated: May 7, 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">1. Information We Collect</h2>
            <p className="mt-2">
              This application may collect wallet addresses, transaction hashes, and basic usage telemetry required
              to provide vault, deposit, withdrawal, and portfolio functionality.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">2. How We Use Information</h2>
            <p className="mt-2">
              Collected data is used to show balances, process on-chain interactions, display vault analytics, and
              maintain application reliability and security.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">3. On-Chain Transparency</h2>
            <p className="mt-2">
              Blockchain transactions are public and immutable. Any transaction you submit may be visible on public
              block explorers.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">4. Third-Party Services</h2>
            <p className="mt-2">
              The app may rely on RPC providers, analytics, or partner APIs. Their data handling practices are
              governed by their respective policies.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">5. Contact</h2>
            <p className="mt-2">
              For privacy-related requests, contact the OpenFin support team through official project channels.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
