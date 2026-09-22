import {
  NextRequest,
  NextResponse,
} from "next/server";

import { globalSearch } from "@/lib/global-search";
import { getSessionUser } from "@/lib/session";

export const dynamic =
  "force-dynamic";

export async function GET(
  request: NextRequest,
) {
  const user =
    await getSessionUser();

  if (!user) {
    return NextResponse.json(
      {
        error:
          "Sessione non valida.",
      },
      {
        status: 401,
      },
    );
  }

  const query =
    request.nextUrl.searchParams
      .get("q")
      ?.trim() ?? "";

  if (query.length < 2) {
    return NextResponse.json({
      results: [],
    });
  }

  try {
    const results =
      await globalSearch(
        query,
      );

    return NextResponse.json({
      results,
    });
  } catch (error) {
    console.error(
      "Errore ricerca globale:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Impossibile completare la ricerca.",
        results: [],
      },
      {
        status: 500,
      },
    );
  }
}