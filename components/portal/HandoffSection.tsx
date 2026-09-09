/**
 * Handoff.
 *
 * The gate shown here is a COURTESY, not the enforcement. What actually prevents
 * an unpaid transfer is the `projects_payment_before_transfer` trigger in
 * migration 0003, which refuses any write setting `ownership_transferred_at`
 * without a cleared final payment — and refuses a backdated one too.
 *
 * That matters: this component could be replaced wholesale by someone editing
 * the page in a browser and the rule would still hold, because the rule does not
 * live here. Never "simplify" this by moving the check into the UI only.
 *
 * There are no credentials on this page and none in the database behind it.
 * Account transfer runs through each provider's own ownership-transfer flow;
 * a portal field holding a password would be a liability with no upside.
 */

import { formatDate, isoDate } from "@/lib/portal/format";
import type { PortalView } from "@/lib/portal/types";
import { EmptyState, Panel, Status } from "./Primitives";
import styles from "./sections.module.css";

const STATUS_MARK = {
  not_ready: <Status tone="neutral">Not ready</Status>,
  ready: <Status tone="attention">Ready</Status>,
  transferred: <Status tone="positive">Transferred</Status>,
  not_applicable: <Status tone="neutral">Not applicable</Status>,
} as const;

export default function HandoffSection({ view }: { view: PortalView }) {
  const { project, handoff } = view;
  const cleared = Boolean(project.finalPaymentClearedAt);
  const transferred = handoff.filter((item) => item.status === "transferred").length;
  const applicable = handoff.filter((item) => item.status !== "not_applicable").length;

  return (
    <div className={styles.stack}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>Handoff</h1>
        <p className={styles.pageLede}>
          When the project is finished, everything it runs on moves to accounts
          you own.
        </p>
      </header>

      <section className={`${styles.gate} ${cleared ? styles.gateOpen : styles.gateClosed}`}>
        <h2 className={styles.gateTitle}>
          {cleared ? "Ownership transfer is available" : "Ownership transfer is not open yet"}
        </h2>
        {cleared ? (
          <p className={styles.gateBody}>
            The final invoice cleared on{" "}
            <time dateTime={isoDate(project.finalPaymentClearedAt)}>
              {formatDate(project.finalPaymentClearedAt)}
            </time>
            . {transferred} of {applicable} accounts have moved across so far.
          </p>
        ) : (
          <p className={styles.gateBody}>
            Ownership transfer becomes available after the final invoice clears.
            Everything below is being prepared in the meantime, so the move itself
            is quick.
          </p>
        )}
      </section>

      <Panel eyebrow="Checklist" title="Accounts and deliverables">
        {handoff.length === 0 ? (
          <EmptyState
            title="The handoff checklist hasn't been set up yet"
            body="Closer to launch, each account — domain, hosting, analytics and the rest — will be listed here so you can watch it move across."
          />
        ) : (
          <ul className={styles.handoffList}>
            {handoff.map((item) => (
              <li key={item.id} className={styles.handoffItem}>
                <div>
                  <span className={styles.handoffLabel}>{item.label}</span>
                  {item.blurb && <p className={styles.handoffBlurb}>{item.blurb}</p>}
                  {item.note && <p className={styles.handoffBlurb}>{item.note}</p>}
                  {item.transferredAt && (
                    <p className="label" style={{ marginTop: "0.25rem" }}>
                      Transferred{" "}
                      <time dateTime={isoDate(item.transferredAt)}>
                        {formatDate(item.transferredAt)}
                      </time>
                    </p>
                  )}
                </div>
                {STATUS_MARK[item.status]}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {project.ownershipTransferredAt && (
        <Panel eyebrow="Complete" title="Ownership transferred">
          <p style={{ margin: 0 }}>
            Everything moved to you on{" "}
            <time dateTime={isoDate(project.ownershipTransferredAt)}>
              {formatDate(project.ownershipTransferredAt)}
            </time>
            . The site and its accounts are yours.
          </p>
        </Panel>
      )}
    </div>
  );
}
