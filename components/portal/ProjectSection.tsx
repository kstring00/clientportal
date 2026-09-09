/**
 * The Project page: what the engagement actually is.
 *
 * Answers "what is happening" in more depth than the overview, and carries the
 * decision log — the thing that stops "did we already decide that?" from ever
 * being an email.
 */

import { isFeatureEnabled } from "@/lib/config";
import { formatDate, isoDate } from "@/lib/portal/format";
import type { PortalView } from "@/lib/portal/types";
import { EmptyState, Panel, Status } from "./Primitives";
import styles from "./sections.module.css";

export default function ProjectSection({ view }: { view: PortalView }) {
  const { project, phases, decisions, fileRequests } = view;
  const outstanding = fileRequests.filter((request) => request.status === "waiting");

  return (
    <div className={styles.stack}>
      <header className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>{project.name}</h1>
        {project.summary && <p className={styles.pageLede}>{project.summary}</p>}
      </header>

      {project.scopeSummary && (
        <Panel eyebrow="Agreed" title="Scope">
          <p style={{ margin: 0 }}>{project.scopeSummary}</p>
        </Panel>
      )}

      <Panel eyebrow="Timeline" title="Phases">
        <ol className={styles.phases}>
          {phases.map((phase) => (
            <li
              key={phase.key}
              className={`${styles.phase} ${
                phase.status === "current"
                  ? styles.phaseCurrent
                  : phase.status === "upcoming"
                    ? styles.phaseUpcoming
                    : ""
              }`}
            >
              <span className={styles.phaseOrdinal}>{phase.ordinal}</span>
              <div>
                <h3 className={styles.phaseLabel}>
                  {phase.label}
                  {phase.status === "complete" && (
                    <Status tone="positive">Complete</Status>
                  )}
                  {phase.status === "current" && (
                    <Status tone="attention">In progress</Status>
                  )}
                  {phase.status === "upcoming" && (
                    <Status tone="neutral">Upcoming</Status>
                  )}
                </h3>
                <p className={styles.phaseBlurb}>{phase.blurb}</p>
                {phase.note && <p className={styles.phaseNote}>{phase.note}</p>}
                {phase.completedAt && (
                  <p className="label" style={{ marginTop: "0.375rem" }}>
                    Completed{" "}
                    <time dateTime={isoDate(phase.completedAt)}>
                      {formatDate(phase.completedAt)}
                    </time>
                  </p>
                )}
              </div>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel eyebrow="Right now" title="What I'm working on">
        {project.currentFocus ? (
          <p style={{ margin: 0 }}>{project.currentFocus}</p>
        ) : (
          <EmptyState
            title="Nothing logged yet"
            body="When work is underway, a plain description of what's in progress appears here."
          />
        )}
      </Panel>

      <Panel eyebrow="From you" title="What I need">
        {project.nextAction || outstanding.length > 0 ? (
          <>
            {project.nextAction && (
              <p style={{ marginTop: 0 }}>
                {project.nextAction}
                {project.nextActionDue && (
                  <>
                    {" — by "}
                    <time dateTime={isoDate(project.nextActionDue)}>
                      {formatDate(project.nextActionDue)}
                    </time>
                  </>
                )}
              </p>
            )}
            {outstanding.length > 0 && (
              <ul className={styles.requests}>
                {outstanding.map((request) => (
                  <li key={request.id} className={styles.request}>
                    <div>
                      <span className={styles.requestLabel}>{request.label}</span>
                      {request.detail && (
                        <p className={styles.requestDetail}>{request.detail}</p>
                      )}
                    </div>
                    <Status tone="attention">Waiting</Status>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <EmptyState
            title="Nothing needed right now"
            body="When I need something from you it will appear here and on your Overview."
          />
        )}
      </Panel>

      {isFeatureEnabled("decisions") && (
        <Panel eyebrow="Settled" title="Decisions">
          {decisions.length === 0 ? (
            <EmptyState
              title="No decisions recorded yet"
              body="As we settle things — a design direction, which photography to use — each one is logged here with the date, so nobody has to remember."
            />
          ) : (
            <div>
              {decisions.map((decision) => (
                <div key={decision.id} className={styles.decision}>
                  <time
                    className={styles.decisionDate}
                    dateTime={isoDate(decision.decidedOn)}
                  >
                    {formatDate(decision.decidedOn)}
                  </time>
                  <div>
                    <p className={styles.decisionTopic}>{decision.topic}</p>
                    <p className={styles.decisionValue}>
                      Decision: {decision.decision}
                    </p>
                    {decision.detail && (
                      <p className={styles.decisionDetail}>{decision.detail}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </Panel>
      )}
    </div>
  );
}
