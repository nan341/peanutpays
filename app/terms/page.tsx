import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms and Conditions - BudgetMitra',
  description: 'Terms governing the use of BudgetMitra.',
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-[#0f2044] mb-1">Terms and Conditions</h1>
        <p className="text-sm text-gray-400 mb-6">Last updated: September 19, 2026</p>

        <p className="text-sm text-gray-700 mb-6">
          By creating an account and using BudgetMitra, you agree to the following terms.
        </p>

        <Section number="1" title="What BudgetMitra is">
          BudgetMitra is a personal and shared expense tracking application. It helps individuals track personal spending and enables friends and groups to record shared debts and settle up.
        </Section>

        <Section number="2" title="Not financial advice">
          Saving tips, spending insights, and AI chat responses are for informational purposes only. BudgetMitra never provides investment advice, and nothing in the application should be treated as financial or investment recommendations.
        </Section>

        <Section number="3" title="User accounts and responsibility">
          You are responsible for safeguarding your login credentials and maintaining the accuracy of data you enter.
        </Section>

        <Section number="4" title="Shared debts and settlements">
          The shared debt tracker and settlement plans are record-keeping aids for informal peer-to-peer tracking. BudgetMitra is not a payment gateway, bank, or party to any loan, does not enforce repayments, and is not responsible for disputes between users. If you add a UPI ID, it is shown only to a friend or group member who owes you money in a shared ledger, when they choose to pay you. BudgetMitra does not process payments or hold money. Payments happen in your UPI app, and the person receiving the money confirms them here.
        </Section>

        <Section number="5" title="Limitation of liability">
          BudgetMitra is provided on an as-is basis without warranties of any kind. We are not liable for decisions made based on information or calculations in the app.
        </Section>

        <Section number="6" title="Contact">
          Questions about these terms can be directed to{' '}
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

function Section({
  number,
  title,
  children,
}: {
  number: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <h2 className="text-sm font-semibold text-[#0f2044] mb-1">
        {number}. {title}
      </h2>
      <p className="text-sm text-gray-600 leading-relaxed">{children}</p>
    </div>
  );
}
