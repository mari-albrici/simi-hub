type StatusBadgeProps = {
  status: string;
  variant?: "success" | "warning" | "danger" | "primary" | "secondary" | "info";
};

export function StatusBadge({ status, variant = "secondary" }: StatusBadgeProps) {
  const normalized = status.toLowerCase();
  const mappedVariant =
    normalized.includes("in corso") || normalized === "active" || normalized === "paid" || normalized === "success"
      ? "success"
      : normalized.includes("anom") || normalized === "anomaly" || normalized === "cancelled"
        ? "danger"
        : normalized.includes("da") || normalized === "to_pay" || normalized === "to_register" || normalized === "open"
          ? "warning"
          : normalized.includes("draft") || normalized === "received"
            ? "secondary"
            : variant;

  return <span className={`badge text-bg-${mappedVariant}`}>{status}</span>;
}
