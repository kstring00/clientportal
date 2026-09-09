import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import AdminProjectOperator from "@/components/admin/AdminProjectOperator";
import AdminShell from "@/components/admin/AdminShell";
import styles from "@/components/admin/admin.module.css";
import { loadAdminProject } from "@/lib/admin/loader";
import { portalConfig } from "@/lib/config";
import { getAdminSession } from "@/lib/supabase/session";

export const dynamic = "force-dynamic";

export default async function AdminProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const session = await getAdminSession();
  if (!session) redirect("/portal");

  const { projectId } = await params;
  const project = await loadAdminProject(projectId);
  if (!project) notFound();

  return (
    <AdminShell>
      <section className={styles.hero}>
        <div>
          <p className={styles.eyebrow}>
            <Link href="/admin">Projects</Link> / {project.clientName}
          </p>
          <h1>{project.name}</h1>
        </div>
        <div>
          <p>
            {project.contactName}
            {project.contactEmail ? ` · ${project.contactEmail}` : ""}
          </p>
          <p className={styles.meta}>
            {project.status} · {project.phase ?? "no phase"}
          </p>
        </div>
      </section>

      <AdminProjectOperator
        project={project}
        phases={portalConfig.phases.map(({ key, label }) => ({ key, label }))}
        categories={portalConfig.fileCategories}
        carePlanEnabled={portalConfig.features.carePlan}
      />
    </AdminShell>
  );
}
