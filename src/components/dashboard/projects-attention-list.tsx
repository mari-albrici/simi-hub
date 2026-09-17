import Link from "next/link";
import type { ProjectAttention } from "@/types";
import { DashboardEmptyState } from "./dashboard-empty-state";

export function ProjectsAttentionList({ projects }: { projects: ProjectAttention[] }) {
  if (projects.length === 0) {
    return <DashboardEmptyState message="Nessuna commessa richiede attenzione al momento." />;
  }

  return (
    <div className="list-group list-group-flush">
      {projects.slice(0, 8).map((project) => (
        <Link
          key={project.id}
          href={`/commesse/${project.id}`}
          className="list-group-item list-group-item-action px-0 py-2 text-decoration-none"
        >
          <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap">
            <div>
              <div className="fw-semibold text-dark">
                {project.project_code} — {project.name}
              </div>
              {project.customer_name ? <div className="small text-muted">{project.customer_name}</div> : null}
            </div>
            <div className="text-end">
              {project.reasons.map((reason) => (
                <span key={reason} className="badge bg-warning-subtle text-dark border me-1 mb-1">
                  {reason}
                </span>
              ))}
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
