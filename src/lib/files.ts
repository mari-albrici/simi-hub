import { AppError } from "./errors";
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;
export const DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
export async function validateDocumentFile(file: File) {
  if (!file.size || file.size > MAX_DOCUMENT_BYTES) throw new AppError("validation", "Dimensione file non valida: massimo 10 MB.");
  if (!DOCUMENT_MIME_TYPES.includes(file.type) || file.name.length > 255) throw new AppError("validation", "Sono ammessi PDF, JPEG, PNG e WebP.");
  const extensions: Record<string, RegExp> = { "application/pdf": /\.pdf$/i, "image/jpeg": /\.jpe?g$/i, "image/png": /\.png$/i, "image/webp": /\.webp$/i };
  if (!file.name.trim() || /[\x00-\x1f\x7f/\\]/.test(file.name) || !extensions[file.type]?.test(file.name)) throw new AppError("validation", "Nome o estensione del file non validi.");
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const ascii = new TextDecoder().decode(bytes);
  const valid = file.type === "application/pdf" ? ascii.startsWith("%PDF-")
    : file.type === "image/jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
    : file.type === "image/png" ? [137,80,78,71,13,10,26,10].every((v,i) => bytes[i] === v)
    : ascii.startsWith("RIFF") && ascii.slice(8,12) === "WEBP";
  if (!valid) throw new AppError("validation", "Il contenuto del file non corrisponde al formato dichiarato.");
}

export function normalizedDocumentName(date: string, type: string, title: string, original: string) {
 const clean=(value:string)=>value.replace(/[\x00-\x1f\x7f/\\:*?"<>|]/g," ").replace(/\s+/g," ").trim();
 const extension=original.split(".").pop()?.toLowerCase()||"pdf";
 return `${date} - ${clean(type).slice(0,70)||"Documento"} - ${clean(title).slice(0,130)||"Allegato"}.${extension}`;
}
export async function documentHash(file: File) {
 const hash=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());
 return Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,"0")).join("");
}
