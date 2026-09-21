"use client";

import { useEffect, useState } from "react";

export default function CurrentDateTime() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());

    const interval = setInterval(() => {
      setNow(new Date());
    }, 60_000);

    return () => clearInterval(interval);
  }, []);

  if (!now) return null;

  const date = now.toLocaleDateString("it-IT", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const time = now.toLocaleTimeString("it-IT", {
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="topbar-datetime text-end text-secondary">
      <span className="topbar-date">{date}</span>
      <span className="topbar-time">{time}</span>
    </div>
  );
}