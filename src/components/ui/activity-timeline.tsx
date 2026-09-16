export type ActivityItem = {
  time: string;
  user: string;
  title: string;
  description: string;
};

export function ActivityTimeline({ items }: { items: ActivityItem[] }) {
  return (
    <div className="app-card p-3">
      <h2 className="h5 mb-3">Attività</h2>
      <div className="position-relative">
        {items.map((item) => (
          <div key={`${item.time}-${item.title}`} className="d-flex gap-3 mb-3 position-relative">
            <div className="position-relative d-flex flex-column align-items-center">
              <span className="rounded-circle bg-dark" style={{ width: 10, height: 10, display: "inline-block" }}></span>
              <span className="border-start border-2 d-block mt-2" style={{ height: "100%", minHeight: 16 }}></span>
            </div>
            <div className="flex-grow-1">
              <div className="small text-muted">{item.time}</div>
              <div className="fw-semibold">{item.user}</div>
              <div className="mt-1"><strong>{item.title}</strong></div>
              <div className="text-muted small">{item.description}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
