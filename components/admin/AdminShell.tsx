import Link from "next/link";
import type { ReactNode } from "react";

import { brandDisplayName, themeCssVariables } from "@/lib/config";
import styles from "./admin.module.css";

export default function AdminShell({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <style>{`:root { ${themeCssVariables()} }`}</style>
      <a className="skip-link" href="#admin-main">
        Skip to main content
      </a>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/admin" className={styles.brand}>
            <strong>{brandDisplayName()}</strong>
            <span>Operator</span>
          </Link>
          <div className={styles.headerActions}>
            <Link href="/portal" className={styles.headerLink}>
              Client portal
            </Link>
            <form action="/api/portal/auth/sign-out" method="post">
              <button type="submit" className={styles.headerLink}>
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className={styles.main} id="admin-main">
        {children}
      </main>
    </div>
  );
}
