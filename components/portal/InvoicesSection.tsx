/**
 * Invoices.
 *
 * Read-only by design. Every figure on this page came from the database, where
 * it was derived server-side from the agreed total — nothing here is computed
 * from anything the browser knows, and no amount is ever sent back.
 *
 * Payment happens on Stripe's own hosted invoice page. The portal never sees a
 * card number, which is the whole reason to use Invoicing rather than collecting
 * payment details here.
 *
 * Care plan billing is shown separately and is never added to the project
 * balance: a lapsed care subscription must not read as an unpaid project.
 */

import { formatMoney } from "@/lib/stripe/money";
import { formatDate, isoDate } from "@/lib/portal/format";
import type { PortalInvoice, PortalView } from "@/lib/portal/types";
import { EmptyState, Panel, Status, primitives } from "./Primitives";
import styles from "./sections.module.css";

const KIND_LABEL: Record<string, string> = {
  deposit: "Deposit",
  final: "Final payment",
  care: "Care plan",
  other: "Invoice",
};

function statusMark(invoice: PortalInvoice) {
  switch (invoice.status) {
    case "paid":
      return <Status tone="positive">Paid</Status>;
    case "past_due":
      return <Status tone="critical">Past due</Status>;
    case "open":
      return <Status tone="attention">Open</Status>;
    case "void":
      return <Status tone="neutral">Void</Status>;
    default:
      return <Status tone="neutral">Not yet issued</Status>;
  }
}

export default function InvoicesSection({ view }: { view: PortalView }) {
  const { invoices, project, carePlan } = view;

  const paid = invoices
    .filter((invoice) => invoice.status === "paid")
    .reduce((total, invoice) => total + invoice.amount, 0);

  const outstanding = invoices
    .filter((invoice) => invoice.status === "open" || invoice.status === "past_due")
    .reduce((total, invoice) => total + invoice.amount, 0);

  return (
    <div className={styles.stack}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Invoices</h1>
        <p className={styles.pageLede}>
          What has been issued, what has been paid, and where to pay anything
          outstanding.
        </p>
      </header>

      <div className={styles.totals}>
        <div className={styles.total}>
          <p className={styles.totalLabel}>Project total</p>
          <p className={styles.totalValue}>
            {project.agreedTotal === null ? "—" : formatMoney(project.agreedTotal)}
          </p>
        </div>
        <div className={styles.total}>
          <p className={styles.totalLabel}>Paid</p>
          <p className={styles.totalValue}>{formatMoney(paid)}</p>
        </div>
        <div className={styles.total}>
          <p className={styles.totalLabel}>Outstanding</p>
          <p className={styles.totalValue}>{formatMoney(outstanding)}</p>
        </div>
      </div>

      <Panel eyebrow="Schedule" title="Project invoices">
        {invoices.length === 0 ? (
          <EmptyState
            title="No invoice has been issued yet"
            body="The deposit is raised when the project starts, and the final payment before handoff. Both will appear here with a secure link to pay."
          />
        ) : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">Invoice</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Issued</th>
                  <th scope="col">Due</th>
                  <th scope="col">Status</th>
                  <th scope="col">
                    <span className="visually-hidden">Payment link</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((invoice) => (
                  <tr key={invoice.id}>
                    <td data-label="Invoice">
                      {KIND_LABEL[invoice.kind] ?? KIND_LABEL.other}
                    </td>
                    <td data-label="Amount" className={styles.numeric}>
                      {formatMoney(invoice.amount, invoice.currency)}
                    </td>
                    <td data-label="Issued" className={styles.numeric}>
                      {invoice.issuedAt ? (
                        <time dateTime={isoDate(invoice.issuedAt)}>
                          {formatDate(invoice.issuedAt)}
                        </time>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Due" className={styles.numeric}>
                      {invoice.dueAt ? (
                        <time dateTime={isoDate(invoice.dueAt)}>
                          {formatDate(invoice.dueAt)}
                        </time>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td data-label="Status">{statusMark(invoice)}</td>
                    <td data-label="">
                      {invoice.hostedUrl &&
                      (invoice.status === "open" || invoice.status === "past_due") ? (
                        <a
                          className={`${primitives.button} ${primitives.buttonSmall}`}
                          href={invoice.hostedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          Pay
                          <span className="visually-hidden">
                            {" "}
                            {KIND_LABEL[invoice.kind]} (opens Stripe in a new tab)
                          </span>
                        </a>
                      ) : invoice.paidAt ? (
                        <span className="label">
                          Paid{" "}
                          <time dateTime={isoDate(invoice.paidAt)}>
                            {formatDate(invoice.paidAt)}
                          </time>
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {carePlan && (
        <Panel eyebrow="Separate" title="Care plan">
          <p style={{ marginTop: 0, color: "var(--ink-muted)" }}>
            Ongoing maintenance, billed monthly. This is separate from the project
            balance above — cancelling it does not affect what is owed on the
            build, and vice versa.
          </p>
          <dl style={{ margin: 0 }}>
            <div className={primitives.defRow}>
              <dt className={primitives.defLabel}>Status</dt>
              <dd className={primitives.defValue}>
                {carePlan.status === "active" && <Status tone="positive">Active</Status>}
                {carePlan.status === "cancelling" && (
                  <Status tone="attention">Cancelling at period end</Status>
                )}
                {carePlan.status === "past_due" && (
                  <Status tone="critical">Past due</Status>
                )}
                {carePlan.status === "cancelled" && (
                  <Status tone="neutral">Cancelled</Status>
                )}
                {carePlan.status === "inactive" && (
                  <Status tone="neutral">Not active</Status>
                )}
              </dd>
            </div>
            {carePlan.currentPeriodEnd && (
              <div className={primitives.defRow}>
                <dt className={primitives.defLabel}>
                  {carePlan.cancelAtPeriodEnd ? "Ends" : "Renews"}
                </dt>
                <dd className={primitives.defValue}>
                  <time dateTime={isoDate(carePlan.currentPeriodEnd)}>
                    {formatDate(carePlan.currentPeriodEnd)}
                  </time>
                </dd>
              </div>
            )}
          </dl>
        </Panel>
      )}
    </div>
  );
}
