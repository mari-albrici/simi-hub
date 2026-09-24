import type { PayrollImportEmployeeCandidate } from "./types";

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .toUpperCase();
}

export function parsePayrollNumber(
  value: string | null | undefined,
): number | null {
  if (!value) return null;

  let normalized = value
    .replace(/\s/g, "")
    .replace(/[€$£CHF]/gi, "")
    .replace(/[^0-9,.'\-]/g, "");

  if (!normalized || normalized === "-") {
    return null;
  }

  const comma = normalized.lastIndexOf(",");
  const dot = normalized.lastIndexOf(".");

  if (comma >= 0 && dot >= 0) {
    if (comma > dot) {
      normalized = normalized
        .replace(/\./g, "")
        .replace(",", ".");
    } else {
      normalized = normalized.replace(/,/g, "");
    }
  } else if (comma >= 0) {
    const decimals =
      normalized.length - comma - 1;

    normalized =
      decimals === 3
        ? normalized.replace(/,/g, "")
        : normalized
            .replace(/\./g, "")
            .replace(",", ".");
  } else if (dot >= 0) {
    const decimals =
      normalized.length - dot - 1;

    if (decimals === 3) {
      normalized = normalized.replace(/\./g, "");
    }
  }

  const parsed = Number(normalized);

  return Number.isFinite(parsed)
    ? parsed
    : null;
}

export function findAmountAfterLabel(
  text: string,
  labels: RegExp[],
): number | null {
  for (const label of labels) {
    const match = text.match(label);

    if (!match) {
      continue;
    }

    const tail = match[1] ?? "";

    const amounts = tail.match(
      /-?\d{1,3}(?:[ .]\d{3})*(?:[,.]\d{1,2})|-?\d+(?:[,.]\d{1,2})?/g,
    );

    if (!amounts?.length) {
      continue;
    }

    const value = parsePayrollNumber(
      amounts[amounts.length - 1],
    );

    if (value !== null) {
      return value;
    }
  }

  return null;
}

type MonthDefinition = {
  month: number;
  pattern: string;
};

const MONTHS: MonthDefinition[] = [
  {
    month: 1,
    pattern: "GENNAIO|JANVIER",
  },
  {
    month: 2,
    pattern: "FEBBRAIO|FEVRIER|FÉVRIER",
  },
  {
    month: 3,
    pattern: "MARZO|MARS",
  },
  {
    month: 4,
    pattern: "APRILE|AVRIL",
  },
  {
    month: 5,
    pattern: "MAGGIO|MAI",
  },
  {
    month: 6,
    pattern: "GIUGNO|JUIN",
  },
  {
    month: 7,
    pattern: "LUGLIO|JUILLET",
  },
  {
    month: 8,
    pattern: "AGOSTO|AOUT|AOÛT",
  },
  {
    month: 9,
    pattern: "SETTEMBRE|SEPTEMBRE",
  },
  {
    month: 10,
    pattern: "OTTOBRE|OCTOBRE",
  },
  {
    month: 11,
    pattern: "NOVEMBRE",
  },
  {
    month: 12,
    pattern: "DICEMBRE|DECEMBRE|DÉCEMBRE",
  },
];

export function detectMonthYear(
  text: string,
): {
  year: number | null;
  month: number | null;
} {
  /*
   * 1. Cerchiamo prima mese + anno nello stesso frammento.
   *
   * È fondamentale sui cedolini perché nella pagina sono
   * presenti molte altre date: nascita, assunzione,
   * autorizzazioni, ecc.
   *
   * Esempio:
   * OTTOBRE 2025
   */
  for (const definition of MONTHS) {
    const monthThenYear = new RegExp(
      `\\b(?:${definition.pattern})\\b[\\s\\S]{0,20}?\\b(20\\d{2})\\b`,
      "i",
    );

    const match = text.match(monthThenYear);

    if (match) {
      return {
        month: definition.month,
        year: Number(match[1]),
      };
    }
  }

  /*
   * 2. Supportiamo anche anno + mese.
   *
   * Alcuni layout/OCR possono invertire visivamente
   * l'ordine dei due elementi.
   */
  for (const definition of MONTHS) {
    const yearThenMonth = new RegExp(
      `\\b(20\\d{2})\\b[\\s\\S]{0,20}?\\b(?:${definition.pattern})\\b`,
      "i",
    );

    const match = text.match(yearThenMonth);

    if (match) {
      return {
        month: definition.month,
        year: Number(match[1]),
      };
    }
  }

  /*
   * 3. Formati numerici espliciti MM/YYYY o MM-YYYY.
   */
  const numericMonthYear = text.match(
    /\b(0?[1-9]|1[0-2])[\/-](20\d{2})\b/,
  );

  if (numericMonthYear) {
    return {
      month: Number(numericMonthYear[1]),
      year: Number(numericMonthYear[2]),
    };
  }

  /*
   * 4. Formati YYYY/MM o YYYY-MM.
   */
  const numericYearMonth = text.match(
    /\b(20\d{2})[\/-](0?[1-9]|1[0-2])\b/,
  );

  if (numericYearMonth) {
    return {
      month: Number(numericYearMonth[2]),
      year: Number(numericYearMonth[1]),
    };
  }

  /*
   * Non associamo più un mese a un anno trovato
   * arbitrariamente altrove nel documento.
   *
   * Se non riusciamo a identificare la coppia periodo,
   * è più sicuro restituire null e richiedere verifica.
   */
  return {
    year: null,
    month: null,
  };
}

function scoreNameMatch(
  sourceName: string,
  candidate: PayrollImportEmployeeCandidate,
): number {
  const source = normalizeText(sourceName);

  if (!source) {
    return 0;
  }

  const normal = normalizeText(
    `${candidate.first_name} ${candidate.last_name}`,
  );

  const reversed = normalizeText(
    `${candidate.last_name} ${candidate.first_name}`,
  );

  if (
    source === normal ||
    source === reversed
  ) {
    return 100;
  }

  const sourceTokens = new Set(
    source
      .split(" ")
      .filter((token) => token.length > 1),
  );

  const candidateTokens = new Set(
    normal
      .split(" ")
      .filter((token) => token.length > 1),
  );

  const overlap = [...sourceTokens].filter(
    (token) => candidateTokens.has(token),
  ).length;

  return overlap >= 2
    ? 70 + overlap
    : 0;
}

export function matchEmployee(
  employeeCode: string | null,
  employeeName: string | null,
  candidates: PayrollImportEmployeeCandidate[],
): {
  employeeId: string | null;
  ambiguous: boolean;
} {
  if (employeeCode) {
    const normalizedCode =
      normalizeText(employeeCode);

    const byCode = candidates.filter(
      (candidate) =>
        candidate.employee_code &&
        normalizeText(
          candidate.employee_code,
        ) === normalizedCode,
    );

    if (byCode.length === 1) {
      return {
        employeeId: byCode[0].id,
        ambiguous: false,
      };
    }

    if (byCode.length > 1) {
      return {
        employeeId: null,
        ambiguous: true,
      };
    }
  }

  if (!employeeName) {
    return {
      employeeId: null,
      ambiguous: false,
    };
  }

  const ranked = candidates
    .map((candidate) => ({
      candidate,
      score: scoreNameMatch(
        employeeName,
        candidate,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return {
      employeeId: null,
      ambiguous: false,
    };
  }

  if (
    ranked.length > 1 &&
    ranked[0].score === ranked[1].score
  ) {
    return {
      employeeId: null,
      ambiguous: true,
    };
  }

  return {
    employeeId: ranked[0].candidate.id,
    ambiguous: false,
  };
}