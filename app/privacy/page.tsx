import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - BudgetMitra',
  description: 'How BudgetMitra handles your account and financial data.',
};

export default function PrivacyPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-[#0f2044] mb-1">Privacy Policy</h1>
        <p className="text-sm text-gray-400 mb-6">Last updated: September 19, 2026</p>

        <p className="text-sm text-gray-700 mb-6">
          BudgetMitra is designed with clear and transparent data privacy controls for all users.
        </p>

        <Section title="Account Information">
          Your account stores your email, handle, display name and a hashed password. Password reset is not available yet.
        </Section>

        <Section title="Personal Financial Data">
          Your personal transactions, categories, amounts, and personal lending notes are private to your account.
        </Section>

        <Section title="Shared Ledgers and Groups">
          Shared ledgers you join, including names, amounts and notes inside them, are visible to the other members of that ledger and to the server.
        </Section>

        <Section title="AI Features and Processing">
          If you use optional AI categorization, only the description of that transaction is sent to our AI provider to suggest a category. When you use saving tips or chat, only amounts, categories, and dates are sent for context. Descriptions, friend names, handles, group names and notes are never sent to any LLM.
        </Section>

        <Section title="Data Deletion">
          You can clear your personal data at any time using the &ldquo;Clear My Data&rdquo; button in the dashboard. This deletes your personal transactions, friends, and personal lending entries. It does not delete shared ledger entries or other users&apos; accounts.
        </Section>

        <Section title="Contact">
          Questions about this policy can be directed to{' '}
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
