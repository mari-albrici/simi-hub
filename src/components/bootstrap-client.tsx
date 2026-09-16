"use client";

import { useEffect } from "react";

export function BootstrapClient() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    void import("bootstrap");
  }, []);

  return null;
}
