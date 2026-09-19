import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy - BudgetMitra",
  description: "How BudgetMitra handles your financial data.",
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-[#0f2044] mb-1">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-6">Last updated: September 19, 2026</p>

        <p className="text-sm text-gray-700 mb-6">
          BudgetMitra is built with one core principle: your financial data belongs to you.
        </p>

        <Section title="What we collect">
          Transaction details you enter (amount, category, date, description), and
          lending/borrowing entries you add for tracking money between friends.
        </Section>

        <Section title="Where your data lives">
          Your data is stored locally on your device by default. It is not uploaded to a remote
          server unless a feature you explicitly enable requires it.
        </Section>

        <Section title="How AI features work">
          When you use saving tips or the chat feature, a summarized, anonymized version of your
          spending pattern is sent to our AI provider to generate a response. We do not send your
          name, friends&apos; names, or any other personal identifiers as part of this process.
        </Section>

        <Section title="What we never do">
          We do not sell your data. We do not share it with advertisers or third parties. We do
          not use your data for anything beyond generating the insights you asked for.
        </Section>

        <Section title="Your control">
          You can clear all stored data at any time using the &ldquo;Clear my data&rdquo; option
          in the dashboard. Doing so is permanent and cannot be undone.
        </Section>

        <Section title="Bank/account integration (future feature)">
          If bank integration is added in future, it will only work through India&apos;s
          RBI-regulated Account Aggregator framework, requiring your explicit and revocable consent
          before any data is shared.
        </Section>

        <Section title="Changes to this policy">
          If this policy changes, we&apos;ll update the date above and note what changed.
        </Section>

        <Section title="Contact">
          Questions about this policy can be directed to{" "}
          <a
            href="mailto:nandini19mehra@gmail.com"
            className="text-teal-700 underline"
          >
            nandini19mehra@gmail.com
          </a>
          .
        </Section>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-[#0f2044] mb-1">{title}</h2>
      <p className="text-sm text-gray-600 leading-relaxed">{children}</p>
    </div>
  );
}
