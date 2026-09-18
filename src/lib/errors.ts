import { z } from "zod";

export type ErrorKind = "authentication" | "forbidden" | "configuration" | "database" | "validation" | "storage" | "conflict";
export class AppError extends Error {
  constructor(public readonly kind: ErrorKind, message: string) { super(message); this.name = "AppError"; }
}
export function checkDatabase(error: { code?: string; message: string } | null, context = "Operazione database") {
  if (!error) return;
  console.error(context, error.code, error.message);
  if (error.code === "42501") throw new AppError("forbidden", "Accesso negato per questa operazione.");
  if (error.code === "40001") throw new AppError("conflict", "Il record è stato modificato da un altro utente. Ricarica prima di salvare.");
  if (["23503", "23505", "23514", "22023", "22007", "22008", "22P02"].includes(error.code ?? "")) {
    throw new AppError("validation", "Dati non validi o incoerenti con i record collegati. Verifica i campi e riprova.");
  }
  throw new AppError("database", `${context} non riuscita. Nessun successo è stato confermato. Riprova o contatta l’amministratore.`);
}
export function publicError(error: unknown): { kind: ErrorKind; message: string } {
  if (error instanceof AppError) return { kind: error.kind, message: error.message };
  if (error instanceof z.ZodError) return { kind: "validation", message: error.issues.map(i => `${i.path.join(".")}: ${i.message}`).join("; ").slice(0, 1200) };
  console.error(error);
  return { kind: "database", message: "Operazione non riuscita. Riprova o contatta l’amministratore." };
}
