import Link from "next/link";

export type KpiTone = "primary" | "warning" | "danger" | "success" | "secondary";

type DashboardKpiCardProps = {
  label: string;
  value: string;
  sublabel?: string;
  tone?: KpiTone;
  href?: string;
};

export function DashboardKpiCard({ label, value, sublabel, tone = "secondary", href }: DashboardKpiCardProps) {
  const body = (
    <div className={`app-card kpi-card kpi-card--${tone} h-100`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sublabel ? <div className="kpi-sublabel">{sublabel}</div> : null}
    </div>
  );

  if (!href) return body;

  return (
    <Link href={href} className="text-decoration-none d-block h-100">
      {body}
    </Link>
  );
}
