/**
 * The Overview.
 *
 * The one screen that has to work in about five seconds. It is ordered by what
 * the client needs, not by what is easiest to render:
 *
 *   1. What do I need to do?      — the next action, largest thing on the page
 *   2. Where does the project stand? — phase, progress, what I'm working on
 *   3. What else needs me?        — attention, only when non-empty
 *   4. What happened recently?    — activity
 *   5. What's coming?             — next milestone
 *
 * Deliberately not an analytics dashboard. Every element answers "what is
 * happening", "what do I need to do", or "what happens next"; anything that
 * answered none of those was left out.
 */

import { phaseIndex, portalConfig } from "@/lib/config";
import { resolveNextAction } from "@/lib/portal/attention";
import { formatDate, formatDateShort, isoDate } from "@/lib/portal/format";
import type { PortalView } from "@/lib/portal/types";
import { EmptyState, Panel, Status } from "./Primitives";
import styles from "./overview.module.css";

function phaseLabel(view: PortalView) {
  const phase = view.phases.find((item) => item.status === "current");
  return phase ? `${phase.ordinal} ${phase.label}` : "Not started";
}

export default function Overview({ view }: { view: PortalView }) {
  const { project, attention, activity, phases } = view;
  const next = resolveNextAction(project.nextAction, attention);

  const currentIndex = phaseIndex(project.phase);
  const completed = phases.filter((phase) => phase.status === "complete").length;

  return (
    <div className={styles.stack}>
      <header>
        <h1 className={styles.welcome}>{portalConfig.content.welcomeTitle}</h1>
        <p className={styles.welcomeBody}>{portalConfig.content.welcomeBody}</p>
      </header>

      {/* 1. What do I need to do? */}
      <section className={styles.nextAction} data-tour="next-action" aria-labelledby="next-action-heading">
        <p className={styles.nextActionLabel} id="next-action-heading">
          Next action
        </p>
        <p className={styles.nextActionText}>{next.text}</p>

        {project.nextActionDue && !next.derived && (
          <p className={styles.nextActionMeta}>
            By{" "}
            <time dateTime={isoDate(project.nextActionDue)}>
              {formatDate(project.nextActionDue)}
            </time>
          </p>
        )}

        {next.href && (
          <a className={styles.nextActionLink} href={next.href}>
            Take a look →
          </a>
        )}
      </section>

      {/* 2. Where does the project stand? */}
      <div className={styles.statusStrip}>
        <div className={styles.statusCell}>
          <p className={styles.statusCellLabel}>Project</p>
          <p className={`${styles.statusCellValue} ${styles.statusCellStrong}`}>
            {project.name}
          </p>
        </div>
        <div className={styles.statusCell}>
          <p className={styles.statusCellLabel}>Current phase</p>
          <p className={`${styles.statusCellValue} ${styles.statusCellStrong}`}>
            {phaseLabel(view)}
          </p>
        </div>
        <div className={styles.statusCell}>
          <p className={styles.statusCellLabel}>Next milestone</p>
          <p className={styles.statusCellValue}>
            {project.nextMilestone ?? "To be scheduled"}
            {project.nextMilestoneAt && (
              <>
                {" — "}
                <time dateTime={isoDate(project.nextMilestoneAt)}>
                  {formatDateShort(project.nextMilestoneAt)}
                </time>
              </>
            )}
          </p>
        </div>
      </div>

      <div className={styles.columns}>
        <div className={styles.stack}>
          <Panel eyebrow="Progress" title="Where things stand">
            {/* A restrained progress mark: one segment per phase, no percentage.
                A percentage on creative work is a number nobody can defend. */}
            <div
              className={styles.progressTrack}
              role="img"
              aria-label={`Phase ${Math.max(currentIndex + 1, 1)} of ${phases.length}: ${phaseLabel(view)}`}
            >
              {phases.map((phase) => (
                <span
                  key={phase.key}
                  className={`${styles.progressSegment} ${
                    phase.status === "complete"
                      ? styles.progressSegmentDone
                      : phase.status === "current"
                        ? styles.progressSegmentCurrent
                        : ""
                  }`}
                />
              ))}
            </div>
            <p className={styles.progressCaption}>
              {completed} of {phases.length} phases complete
            </p>

            {project.currentFocus && (
              <>
                <hr
                  style={{
                    border: 0,
                    borderTop: "1px solid var(--line)",
                    margin: "1.125rem 0 1rem",
                  }}
                />
                <p className="label" style={{ marginBottom: "0.375rem" }}>
                  Currently working on
                </p>
                <p style={{ margin: 0 }}>{project.currentFocus}</p>
              </>
            )}
          </Panel>

          {/* 4. What happened recently? */}
          <Panel eyebrow="Recent" title="Activity">
            {activity.length === 0 ? (
              <EmptyState
                title="Nothing has happened yet"
                body="As the project moves — files added, approvals decided, invoices paid — it will be listed here in order."
              />
            ) : (
              <ul className={styles.activityList}>
                {activity.map((item) => (
                  <li key={item.id} className={styles.activityItem}>
                    <time
                      className={styles.activityDate}
                      dateTime={isoDate(item.createdAt)}
                    >
                      {formatDateShort(item.createdAt)}
                    </time>
                    <span className={styles.activityText}>
                      {item.summary}
                      {item.actorName && (
                        <span className={styles.activityActor}> — {item.actorName}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className={styles.stack}>
          {/* 3. Only rendered when something genuinely needs them. An empty
              "needs your attention" panel trains people to ignore the real one. */}
          {attention.length > 0 && (
            <Panel
              eyebrow="Needs you"
              title={`${attention.length} thing${attention.length === 1 ? "" : "s"} waiting`}
            >
              <ul className={styles.attentionList}>
                {attention.map((item) => (
                  <li key={item.id} className={styles.attentionItem}>
                    <a className={styles.attentionLink} href={item.href}>
                      <span>
                        <span className={styles.attentionLabel}>{item.label}</span>
                        {item.detail && (
                          <span className={styles.attentionDetail}>{item.detail}</span>
                        )}
                      </span>
                      <span className={styles.attentionArrow} aria-hidden="true">
                        →
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <Panel eyebrow="What's next" title="Coming up">
            {project.nextMilestone ? (
              <>
                <p style={{ margin: "0 0 0.375rem" }}>{project.nextMilestone}</p>
                {project.nextMilestoneAt && (
                  <p className="label" style={{ margin: 0 }}>
                    <time dateTime={isoDate(project.nextMilestoneAt)}>
                      {formatDate(project.nextMilestoneAt)}
                    </time>
                  </p>
                )}
              </>
            ) : (
              <EmptyState
                title="Nothing scheduled yet"
                body="The next milestone will appear here once it's set."
              />
            )}
          </Panel>

          {project.status !== "active" && (
            <Panel eyebrow="Status" title="Project state">
              <Status tone={project.status === "complete" ? "positive" : "neutral"}>
                {project.status}
              </Status>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
}
