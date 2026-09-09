import Link from "next/link";
import { redirect } from "next/navigation";

import AdminInviteForm from "@/components/admin/AdminInviteForm";
import AdminShell from "@/components/admin/AdminShell";
import styles from "@/components/admin/admin.module.css";
import { loadAdminProjects } from "@/lib/admin/loader";
import { phaseByKey } from "@/lib/config";
import { getAdminSession } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

function money(value: number | null) {
  if (value === null) return "Not set";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(value);
}

export default async function AdminPage() {
  const session = await getAdminSession();
  if (!session) redirect("/portal");

  const projects = await loadAdminProjects();

  return (
    <AdminShell>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>Client operations</p>
          <h1>Projects, without the inbox archaeology.</h1>
        </div>
        <p>
          Create the portal, move the project, ask for what you need, issue the
          invoice, and complete handoff from one place.
        </p>
      </section>

      <div className={styles.stack}>
        <AdminInviteForm />

        <section aria-labelledby="projects-heading">
          <div className={styles.panelHead} style={{ marginBottom: "0.9rem" }}>
            <div>
              <p className={styles.eyebrow}>Active workspace</p>
              <h2 id="projects-heading">Projects</h2>
            </div>
            <span className={styles.meta}>{projects.length} total</span>
          </div>

          {projects.length === 0 ? (
            <div className={styles.panel}>
              <p className={styles.muted}>
                No projects yet. The first portal you create will appear here.
              </p>
            </div>
          ) : (
            <div className={styles.grid}>
              {projects.map((project) => (
                <Link href={`/admin/${project.id}`} className={styles.card} key={project.id}>
                  <div className={styles.cardTop}>
                    <span className={styles.status}>
                      {phaseByKey(project.phase)?.label ?? project.phase ?? "No phase"}
                    </span>
                    <span className={styles.meta}>{project.status}</span>
                  </div>
                  <div>
                    <h2>{project.name}</h2>
                    <p>{project.clientName}</p>
                  </div>
                  <div className={styles.row}>
                    <span className={styles.meta}>
                      {project.nextAction ? `Next: ${project.nextAction}` : "No client action"}
                    </span>
                    <strong className={styles.money}>{money(project.agreedTotal)}</strong>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </AdminShell>
  );
}
