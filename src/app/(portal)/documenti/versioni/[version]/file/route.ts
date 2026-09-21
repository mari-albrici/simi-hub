import { signedDocumentVersion } from "@/lib/documents";
import { publicError } from "@/lib/errors";

export async function GET(request: Request, { params }: { params: Promise<{ version: string }> }) {
  try {
    const query = new URL(request.url).searchParams;
    const url = await signedDocumentVersion((await params).version, query.get("download") === "1");
    const headers = { "Cache-Control": "private, no-store" };
    if (query.get("resolve") === "1") return Response.json({ url }, { headers });
    return new Response(null, { status: 302, headers: { ...headers, Location: url } });
  } catch (error) {
    const err = publicError(error);
    return Response.json({ error: err.message }, { status: err.kind === "forbidden" ? 403 : err.kind === "authentication" ? 401 : 400, headers: { "Cache-Control": "no-store" } });
  }
}
