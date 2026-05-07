export default function TermsOfUsePage() {
  return (
    <div className="min-h-full bg-white dark:bg-[#000000]">
      <div className="mx-auto w-full max-w-4xl p-4 lg:p-6">
        <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">Terms of Use</h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">Last Modified: May 2026</p>

        <div className="mt-8 space-y-6 text-sm leading-7 text-zinc-700 dark:text-zinc-300">
          <section>
            <p className="mt-2">
              These Terms of Use govern your access to and use of the OpenFin website, applications, APIs, AI Systems, automations, dashboards, exchange integrations, Wallet integrations, developer tools, interfaces, and related services operated by OpenFin, OpenLedger, and their affiliates, operators, licensors, service providers, and related entities (“OpenFin,” “OpenLedger,” “Company,” “we,” “us,” or “our”).
              </p>
            <p className="mt-2">
              By accessing, connecting to, interacting with, configuring, integrating with, or otherwise using the Services, you acknowledge that you have read, understood, and agreed to be bound by these Terms of Use and all applicable policies incorporated herein by reference.
              </p>
            <p className="mt-2">
              These Terms apply to all Users, visitors, Wallet-connected participants, API Users, exchange-connected Users, developers, automation Users, and any individual or entity accessing or interacting with the Services.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">2. No Financial Advice</h2>
            <p className="mt-2">
              Content and data provided by the app are for informational purposes only and do not constitute legal,
              tax, or financial advice.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">3. User Responsibility</h2>
            <p className="mt-2">
              You are responsible for wallet security, private key management, transaction verification, and
              compliance with applicable laws in your jurisdiction.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">4. Protocol and Market Risk</h2>
            <p className="mt-2">
              DeFi and tokenized strategies involve smart contract, oracle, liquidity, and market risks. Loss of
              funds may occur.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">5. Limitation of Liability</h2>
            <p className="mt-2">
              The app is provided "as is" without warranties. To the fullest extent permitted by law, the maintainers
              are not liable for losses arising from use of the application.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}
