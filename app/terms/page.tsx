import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms and Conditions - BudgetMitra",
  description: "Terms governing the use of BudgetMitra.",
};

export default function TermsPage() {
  return (
    <div className="max-w-2xl mx-auto">
      <div className="bg-white rounded-lg border border-gray-200 p-6 md:p-8">
        <h1 className="text-2xl font-bold text-[#0f2044] mb-1">Terms and Conditions</h1>
        <p className="text-sm text-gray-400 mb-6">Last updated: September 19, 2026</p>

        <p className="text-sm text-gray-700 mb-6">
          By using BudgetMitra, you agree to the following terms.
        </p>

        <Section number="1" title="What BudgetMitra is">
          BudgetMitra is a personal budgeting and expense-tracking tool. It helps you log
          spending, understand your habits, and track money lent to or borrowed from friends.
        </Section>

        <Section number="2" title="Not financial advice">
          Saving tips, spending insights, and any educational content in the app are for
          informational purposes only. BudgetMitra does not provide investment advice, and nothing
          in the app should be treated as a recommendation to buy, sell, or invest in any
          financial product.
        </Section>

        <Section number="3" title="Accuracy of information">
          You are responsible for the accuracy of the transaction and lending data you enter.
          BudgetMitra reflects the data you provide and does not independently verify it.
        </Section>

        <Section number="4" title="Friend/lending tracker">
          The lending tracker is a personal record-keeping tool between you and people you choose
          to log. BudgetMitra is not a party to any loan, does not enforce repayment, and is not
          responsible for disputes between users and their contacts.
        </Section>

        <Section number="5" title="Account and data">
          You are responsible for keeping your device secure, since your data is stored locally.
          If you clear your data, it is permanently deleted and cannot be recovered by us.
        </Section>

        <Section number="6" title="Changes to the service">
          Features may be added, changed, or removed as the app evolves, including during
          hackathon development.
        </Section>

        <Section number="7" title="Limitation of liability">
          BudgetMitra is provided as-is, without warranties of any kind. We are not liable for
          financial decisions made based on information in the app.
        </Section>

        <Section number="8" title="Contact">
          Questions about these terms can be directed to{" "}
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
