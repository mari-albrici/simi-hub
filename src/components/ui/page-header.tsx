type PageHeaderProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  actionHref?: string;
};

export function PageHeader({ title, description, actionLabel, actionHref }: PageHeaderProps) {
  return (
    <div className="d-flex justify-content-between align-items-center gap-3 mb-3 flex-wrap">
      <div>
        <h1 className="h3 mb-1">{title}</h1>
        {description ? <p className="text-muted mb-0">{description}</p> : null}
      </div>
      {actionLabel && actionHref ? (
        <a href={actionHref} className="btn btn-dark">{actionLabel}</a>
      ) : null}
    </div>
  );
}
