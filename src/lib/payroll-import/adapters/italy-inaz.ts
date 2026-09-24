import type {
  PayrollImportItem,
  PayrollImportNormalizedRow,
  PayrollImportWarning,
} from "../types";

import {
  detectMonthYear,
  parsePayrollNumber,
} from "../normalize";

/*
 * ============================================================
 * INAZ — ITALIAN PAYROLL ADAPTER
 * ============================================================
 *
 * Adapter dedicato ai cedolini italiani prodotti tramite INAZ.
 *
 * Obiettivi:
 * - riconoscere il layout tramite più segnali;
 * - non dipendere dalle coordinate del PDF;
 * - usare codici + descrizioni quando disponibili;
 * - tollerare OCR AUTO e OCR SPARSE;
 * - evitare di confondere importi vicini;
 * - non inventare dati mancanti;
 * - leggere il calendario presenze INAZ per le ore ordinarie;
 * - conservare le singole voci per utilizzi futuri.
 */

const MONEY_TOKEN_PATTERN =
  /-?\d{1,3}(?:\.\d{3})*(?:,\d+)-?|-?\d+(?:,\d+)-?/g;

const ITALIAN_TAX_CODE_PATTERN =
  /[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]/;

/*
 * ============================================================
 * UTILITÀ TESTO
 * ============================================================
 */

function linesOf(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) =>
      line
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter(Boolean);
}

function normalizeForDetection(
  value: string,
): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoneyToken(
  value: string | undefined | null,
): number | null {
  if (!value) {
    return null;
  }

  const cleaned = value
    .trim()
    .replace(/\s+/g, "");

  const trailingMinus =
    cleaned.endsWith("-");

  const withoutTrailingMinus =
    trailingMinus
      ? cleaned.slice(0, -1)
      : cleaned;

  const parsed =
    parsePayrollNumber(
      withoutTrailingMinus,
    );

  if (
    parsed === null ||
    !Number.isFinite(parsed)
  ) {
    return null;
  }

  return trailingMinus
    ? -Math.abs(parsed)
    : parsed;
}

function moneyTokensFrom(
  value: string,
): Array<{
  raw: string;
  value: number;
  index: number;
}> {
  const result: Array<{
    raw: string;
    value: number;
    index: number;
  }> = [];

  for (
    const match of value.matchAll(
      MONEY_TOKEN_PATTERN,
    )
  ) {
    const parsed =
      parseMoneyToken(match[0]);

    if (parsed === null) {
      continue;
    }

    result.push({
      raw: match[0],
      value: parsed,
      index: match.index ?? 0,
    });
  }

  return result;
}

function lastMoneyFrom(
  value: string,
): number | null {
  const values =
    moneyTokensFrom(value);

  if (!values.length) {
    return null;
  }

  return values[
    values.length - 1
  ].value;
}

function firstMoneyFrom(
  value: string,
): number | null {
  const values =
    moneyTokensFrom(value);

  return values[0]?.value ?? null;
}

function absoluteOrNull(
  value: number | null,
): number | null {
  return value === null
    ? null
    : Math.abs(value);
}

/*
 * ============================================================
 * RICONOSCIMENTO LAYOUT INAZ
 * ============================================================
 */

export function isInazPayrollLayout(
  text: string,
): boolean {
  const normalized =
    normalizeForDetection(text);

  let score = 0;

  const signals: Array<
    [RegExp, number]
  > = [
    [/\bINAZ\b/, 3],

    [
      /\bMESE\s+E\s+PERIODO\s+COMPETENZA\b/,
      3,
    ],

    [
      /\bTOTALE\s+RITENUTE\b/,
      2,
    ],

    [
      /\bTOTALE\s+COMPETENZE\b/,
      2,
    ],

    [
      /\bNETTO\s+A\s+PAGARE\b/,
      3,
    ],

    [
      /\bIMPON(?:IBILE)?\s+FISCALE\s+MESE\b/,
      2,
    ],

    [
      /\bTOTALE\s+RITENUTE\s+SOCIALI\b/,
      2,
    ],

    [
      /\bPREVIDENZIALE\s+NON\s+ARROT\b/,
      2,
    ],

    [
      /\bFERIE\s+E\s+PERMESSI\b/,
      1,
    ],

    [
      /\bPRESENZE\s+MESE\s+DI\b/,
      2,
    ],

    [
      /\bCONTRIBUTO\s+FAP\b/,
      1,
    ],
  ];

  for (
    const [pattern, weight] of signals
  ) {
    pattern.lastIndex = 0;

    if (pattern.test(normalized)) {
      score += weight;
    }
  }

  /*
   * "INAZ" da solo non basta.
   *
   * Accettiamo il layout quando sono presenti
   * più elementi strutturali tipici.
   */
  return score >= 6;
}

/*
 * ============================================================
 * DIPENDENTE
 * ============================================================
 */

function extractEmployeeName(
  text: string,
): string | null {
  const lines = linesOf(text);

  /*
   * Caso tipico AUTO:
   *
   * CODICE | COGNOME E NOME
   * 1268 AFRAH SMAIL
   */
  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    if (
      !/COGNOME\s+E\s+NOME/i.test(
        lines[index],
      )
    ) {
      continue;
    }

    const window = lines
      .slice(
        index,
        index + 5,
      )
      .join(" ");

    const match = window.match(
      /\b\d{1,8}\s+([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'’-]+){1,4})\b/,
    );

    if (match?.[1]) {
      return match[1]
        .replace(/\s+/g, " ")
        .trim();
    }
  }

  return null;
}

function extractEmployeeCode(
  text: string,
): string | null {
  const lines = linesOf(text);

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    if (
      !/COGNOME\s+E\s+NOME/i.test(
        lines[index],
      )
    ) {
      continue;
    }

    const window = lines
      .slice(
        index,
        index + 5,
      )
      .join(" ");

    const match = window.match(
      /(?:CODICE\s+)?(?:COGNOME\s+E\s+NOME)?.{0,60}?\b(\d{1,8})\s+[A-ZÀ-ÖØ-Ý]/i,
    );

    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

function extractItalianTaxCode(
  text: string,
): string | null {
  const normalized = text
    .toUpperCase()
    .replace(/\s+/g, "");

  return (
    normalized.match(
      ITALIAN_TAX_CODE_PATTERN,
    )?.[0] ?? null
  );
}

/*
 * ============================================================
 * RIGHE / BLOCCHI
 * ============================================================
 */

function findLineIndex(
  lines: string[],
  pattern: RegExp,
  startIndex = 0,
): number {
  for (
    let index = startIndex;
    index < lines.length;
    index += 1
  ) {
    pattern.lastIndex = 0;

    if (pattern.test(lines[index])) {
      return index;
    }
  }

  return -1;
}

function findLine(
  lines: string[],
  pattern: RegExp,
): string | null {
  const index =
    findLineIndex(
      lines,
      pattern,
    );

  return index >= 0
    ? lines[index]
    : null;
}

function lineWindow(
  lines: string[],
  index: number,
  before = 0,
  after = 0,
): string {
  if (index < 0) {
    return "";
  }

  return lines
    .slice(
      Math.max(0, index - before),
      Math.min(
        lines.length,
        index + after + 1,
      ),
    )
    .join(" ");
}

/*
 * ============================================================
 * VOCI INAZ
 * ============================================================
 *
 * Le singole voci vengono conservate in items.
 *
 * Non utilizziamo però items come unica fonte dei riepiloghi,
 * perché OCR AUTO e OCR SPARSE possono separare descrizione,
 * quantità, base e importo su righe diverse.
 */

function parseInazItemLine(
  line: string,
): PayrollImportItem | null {
  const cleaned = line
    .replace(
      /^[|[\]\s]+/,
      "",
    )
    .trim();

  /*
   * Codici INAZ osservati:
   *
   * G10
   * 002
   * 003
   * 013
   * 018
   * 116
   * 219
   * J01
   * V01
   * V11
   * V14
   * 001
   * 801
   * 900
   * 101
   * 111
   * 116
   * 121
   * IE1
   */
  const match =
    cleaned.match(
      /^([A-Z]{0,2}\d{1,3})\s+(.+)$/i,
    );

  if (!match) {
    return null;
  }

  const code =
    match[1].toUpperCase();

  const remainder =
    match[2].trim();

  const numberMatches =
    moneyTokensFrom(
      remainder,
    );

  if (!numberMatches.length) {
    return {
      code,
      description: remainder,
      quantity: null,
      base: null,
      earnings: null,
      deductions: null,
      amount: null,
      raw: line,
    };
  }

  const firstNumber =
    numberMatches[0];

  const description =
    remainder
      .slice(
        0,
        firstNumber.index,
      )
      .trim();

  const values =
    numberMatches.map(
      (entry) => entry.value,
    );

  const quantity =
    values.length >= 2
      ? values[0]
      : null;

  const base =
    values.length >= 3
      ? values[
          values.length - 2
        ]
      : null;

  const amount =
    values.length
      ? values[
          values.length - 1
        ]
      : null;

  return {
    code,
    description:
      description || remainder,
    quantity,
    base,
    earnings: null,
    deductions: null,
    amount,
    raw: line,
  };
}

function parseInazItems(
  text: string,
): PayrollImportItem[] {
  const lines =
    linesOf(text);

  const items:
    PayrollImportItem[] = [];

  for (const line of lines) {
    const item =
      parseInazItemLine(line);

    if (item) {
      items.push(item);
    }
  }

  const unique =
    new Map<
      string,
      PayrollImportItem
    >();

  for (const item of items) {
    const key = [
      item.code ?? "",
      item.description
        .toUpperCase()
        .replace(/\s+/g, " "),
      item.quantity ?? "",
      item.base ?? "",
      item.amount ?? "",
    ].join("|");

    if (!unique.has(key)) {
      unique.set(
        key,
        item,
      );
    }
  }

  return [
    ...unique.values(),
  ];
}

function findItem(
  items: PayrollImportItem[],
  code: string | null,
  description: RegExp,
): PayrollImportItem | null {
  return (
    items.find((item) => {
      description.lastIndex = 0;

      const codeMatches =
        code === null ||
        item.code?.toUpperCase() ===
          code.toUpperCase();

      return (
        codeMatches &&
        description.test(
          item.description,
        )
      );
    }) ?? null
  );
}

/*
 * ============================================================
 * ESTRAZIONE DI UNA VOCE TRAMITE CODICE + DESCRIZIONE
 * ============================================================
 *
 * Questa funzione è più robusta del vecchio
 * "prendi l'ultimo numero entro N caratteri".
 *
 * Cerca prima una riga completa.
 *
 * Se OCR SPARSE ha separato la voce dal valore, utilizza
 * solo poche righe immediatamente successive e si ferma
 * appena incontra una nuova voce.
 */

function extractCodedAmount(
  text: string,
  codes: string[],
  description: RegExp,
  options: {
    pick?: "first" | "last";
    maxFollowingLines?: number;
  } = {},
): number | null {
  const lines =
    linesOf(text);

  const {
    pick = "last",
    maxFollowingLines = 3,
  } = options;

  const normalizedCodes =
    new Set(
      codes.map((code) =>
        code.toUpperCase(),
      ),
    );

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const line =
      lines[index];

    const codeMatch =
      line.match(
        /^\s*([A-Z]{0,2}\d{1,3})\b/i,
      );

    if (!codeMatch) {
      continue;
    }

    const code =
      codeMatch[1].toUpperCase();

    if (
      !normalizedCodes.has(code)
    ) {
      continue;
    }

    description.lastIndex = 0;

    if (
      !description.test(line)
    ) {
      /*
       * OCR può mettere il codice su una riga
       * e la descrizione sulla successiva.
       */
      const shortWindow =
        lineWindow(
          lines,
          index,
          0,
          1,
        );

      description.lastIndex = 0;

      if (
        !description.test(
          shortWindow,
        )
      ) {
        continue;
      }
    }

    /*
     * Prima: importi presenti sulla stessa riga.
     */
    const afterCode =
      line.replace(
        /^\s*[A-Z]{0,2}\d{1,3}\b/i,
        "",
      );

    const sameLineValues =
      moneyTokensFrom(
        afterCode,
      );

    if (sameLineValues.length) {
      const selected =
        pick === "first"
          ? sameLineValues[0]
          : sameLineValues[
              sameLineValues.length - 1
            ];

      return Math.abs(
        selected.value,
      );
    }

    /*
     * Fallback SPARSE:
     * leggiamo solo le righe immediatamente successive.
     */
    const values: number[] = [];

    for (
      let offset = 1;
      offset <= maxFollowingLines;
      offset += 1
    ) {
      const candidate =
        lines[index + offset];

      if (!candidate) {
        break;
      }

      /*
       * Una nuova voce indica la fine del blocco.
       */
      if (
        /^[A-Z]{0,2}\d{1,3}\b/i.test(
          candidate,
        )
      ) {
        break;
      }

      values.push(
        ...moneyTokensFrom(
          candidate,
        ).map(
          (entry) =>
            Math.abs(
              entry.value,
            ),
        ),
      );
    }

    if (values.length) {
      return pick === "first"
        ? values[0]
        : values[
            values.length - 1
          ];
    }
  }

  return null;
}

/*
 * ============================================================
 * RIEPILOGO TOTALE COMPETENZE / RITENUTE
 * ============================================================
 */

function extractInazTotals(
  text: string,
): {
  totalDeductions: number | null;
  totalEarnings: number | null;
} {
  const lines =
    linesOf(text);

  /*
   * Caso OCR AUTO:
   *
   * Totale Ritenute Totale Competenze
   * 1231,31 4912,77
   *
   * oppure etichette e valori sulla stessa riga.
   */
  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const current =
      lines[index];

    if (
      !/TOTALE\s+RITENUTE/i.test(
        current,
      ) ||
      !/TOTALE\s+COMPETENZE/i.test(
        current,
      )
    ) {
      continue;
    }

    /*
     * Importi eventualmente già presenti
     * sulla stessa riga.
     */
    let values =
      moneyTokensFrom(
        current,
      ).map(
        (entry) =>
          Math.abs(
            entry.value,
          ),
      );

    /*
     * Altrimenti cerchiamo nelle sole
     * righe immediatamente successive.
     */
    if (values.length < 2) {
      values = [];

      for (
        let offset = 1;
        offset <= 4;
        offset += 1
      ) {
        const next =
          lines[index + offset];

        if (!next) {
          break;
        }

        if (
          /ARR\.?\s*PRECEDENTE/i.test(
            next,
          ) ||
          /NETTO\s+A?\s*PAGARE/i.test(
            next,
          )
        ) {
          break;
        }

        values.push(
          ...moneyTokensFrom(
            next,
          ).map(
            (entry) =>
              Math.abs(
                entry.value,
              ),
          ),
        );

        if (values.length >= 2) {
          break;
        }
      }
    }

    if (values.length >= 2) {
      const deductions =
        values[0];

      const earnings =
        values[1];

      /*
       * Controllo di plausibilità:
       * le competenze normalmente superano
       * le ritenute.
       */
      if (
        earnings >= deductions
      ) {
        return {
          totalDeductions:
            deductions,
          totalEarnings:
            earnings,
        };
      }
    }
  }

  /*
   * Caso OCR SPARSE:
   *
   * Totale Ritenute
   * Totale Competenze
   * ...
   * 1231,31
   * 4912,77
   */
  const deductionsIndex =
    findLineIndex(
      lines,
      /TOTALE\s+RITENUTE/i,
    );

  if (deductionsIndex >= 0) {
    const earningsIndex =
      findLineIndex(
        lines,
        /TOTALE\s+COMPETENZE/i,
        deductionsIndex,
      );

    if (
      earningsIndex >=
        deductionsIndex &&
      earningsIndex <=
        deductionsIndex + 3
    ) {
      const values: number[] = [];

      for (
        let index =
          earningsIndex + 1;
        index <
          Math.min(
            lines.length,
            earningsIndex + 8,
          );
        index += 1
      ) {
        const line =
          lines[index];

        if (
          /ARR\.?\s*PRECEDENTE/i.test(
            line,
          ) ||
          /NETTO/i.test(
            line,
          )
        ) {
          break;
        }

        values.push(
          ...moneyTokensFrom(
            line,
          ).map(
            (entry) =>
              Math.abs(
                entry.value,
              ),
          ),
        );

        if (values.length >= 2) {
          break;
        }
      }

      if (values.length >= 2) {
        const deductions =
          values[0];

        const earnings =
          values[1];

        if (
          earnings >= deductions
        ) {
          return {
            totalDeductions:
              deductions,
            totalEarnings:
              earnings,
          };
        }
      }
    }
  }

  return {
    totalDeductions: null,
    totalEarnings: null,
  };
}

/*
 * ============================================================
 * NETTO A PAGARE
 * ============================================================
 */

function extractNetPay(
  text: string,
): number | null {
  const lines =
    linesOf(text);

  /*
   * Caso normale:
   *
   * NETTO A PAGARE 3.682,00
   */
  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const line =
      lines[index];

    const match =
      line.match(
        /NETTO\s+A\s+PAGARE\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})/i,
      );

    if (match?.[1]) {
      return absoluteOrNull(
        parseMoneyToken(
          match[1],
        ),
      );
    }
  }

  /*
   * OCR può produrre:
   *
   * NETTO
   * A PAGARE
   * 3.682,00
   *
   * oppure:
   *
   * NETTO
   * A PAGARE
   * ...
   * .682,00
   *
   * Il secondo caso perde il "3".
   *
   * Per evitare di importare 682 come netto,
   * cerchiamo anche una riconciliazione:
   *
   * totale competenze - totale ritenute
   * + arrotondamenti.
   */

  const nettoIndex =
    findLineIndex(
      lines,
      /^NETTO$/i,
    );

  if (nettoIndex >= 0) {
    const window =
      lines
        .slice(
          nettoIndex,
          nettoIndex + 6,
        )
        .join(" ");

    const values =
      moneyTokensFrom(
        window,
      );

    if (values.length) {
      const candidate =
        Math.abs(
          values[
            values.length - 1
          ].value,
        );

      /*
       * Lo restituiamo solo se sembra
       * un importo completo.
       *
       * Se l'OCR ha perso la cifra iniziale,
       * verrà usata la riconciliazione sotto.
       */
      if (
        candidate >= 1000
      ) {
        return candidate;
      }
    }
  }

  const totals =
    extractInazTotals(text);

  if (
    totals.totalEarnings !== null &&
    totals.totalDeductions !== null
  ) {
    /*
     * Nel cedolino osservato:
     *
     * Totale competenze 4912,77
     * Totale ritenute   1231,31
     * differenza        3681,46
     *
     * Arr. precedente   0,02
     * Arr. attuale      0,56
     *
     * netto             3682,00
     */
    const previousRounding =
      extractRoundingAmount(
        text,
        /ARR\.?\s*PRECEDENTE/i,
      ) ?? 0;

    const currentRounding =
      extractRoundingAmount(
        text,
        /ARR\.?\s*ATTUALE/i,
      ) ?? 0;

    const reconciled =
      totals.totalEarnings -
      totals.totalDeductions -
      previousRounding +
      currentRounding;

    if (reconciled > 0) {
      return Math.round(
        reconciled * 100,
      ) / 100;
    }
  }

  return null;
}

function extractRoundingAmount(
  text: string,
  pattern: RegExp,
): number | null {
  const lines =
    linesOf(text);

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    pattern.lastIndex = 0;

    const match =
      pattern.exec(
        lines[index],
      );

    if (!match) {
      continue;
    }

    const after =
      lines[index].slice(
        match.index +
          match[0].length,
      );

    const sameLine =
      firstMoneyFrom(after);

    if (sameLine !== null) {
      return sameLine;
    }

    const next =
      lines[index + 1];

    if (next) {
      return firstMoneyFrom(
        next,
      );
    }
  }

  return null;
}

/*
 * ============================================================
 * IMPONIBILE PREVIDENZIALE
 * ============================================================
 */

function extractSocialSecurityBase(
  text: string,
  items: PayrollImportItem[],
): number | null {
  /*
   * Prima scelta:
   *
   * V01 Previdenziale non arrot. 3777,10
   */
  const item =
    findItem(
      items,
      "V01",
      /PREVIDENZIALE\s+NON\s+ARROT/i,
    );

  if (
    item?.amount !== null &&
    item?.amount !== undefined
  ) {
    return Math.abs(
      item.amount,
    );
  }

  const direct =
    extractCodedAmount(
      text,
      ["V01", "VO1"],
      /PREVIDENZIALE\s+NON\s+ARROT/i,
      {
        pick: "last",
        maxFollowingLines: 2,
      },
    );

  if (direct !== null) {
    return direct;
  }

  /*
   * Fallback:
   *
   * J01 Decontr.-impon.prev.mese
   */
  return extractCodedAmount(
    text,
    ["J01", "JO1"],
    /DECONTR.*IMPON.*PREV.*MESE/i,
    {
      pick: "last",
      maxFollowingLines: 2,
    },
  );
}

/*
 * ============================================================
 * CONTRIBUTI DIPENDENTE
 * ============================================================
 */

function extractEmployeeContributions(
  text: string,
  items: PayrollImportItem[],
): number | null {
  /*
   * Prima scelta:
   *
   * 900 Totale ritenute sociali 358,44
   */
  const item =
    findItem(
      items,
      "900",
      /TOTALE\s+RITENUTE\s+SOCIALI/i,
    );

  if (
    item?.amount !== null &&
    item?.amount !== undefined
  ) {
    return Math.abs(
      item.amount,
    );
  }

  const direct =
    extractCodedAmount(
      text,
      ["900"],
      /TOTALE\s+RITENUTE\s+SOCIALI/i,
      {
        pick: "last",
        maxFollowingLines: 2,
      },
    );

  if (direct !== null) {
    return direct;
  }

  /*
   * Fallback:
   *
   * 001 Contributo FAP ... 358,44-
   *
   * Solo se il totale sociale non è disponibile.
   */
  return extractCodedAmount(
    text,
    ["001"],
    /CONTRIBUTO\s+FAP/i,
    {
      pick: "last",
      maxFollowingLines: 2,
    },
  );
}

/*
 * ============================================================
 * IRPEF
 * ============================================================
 */

function extractIncomeTax(
  text: string,
  items: PayrollImportItem[],
): number | null {
  /*
   * Cedolino INAZ osservato:
   *
   * 121 Irpef cod.1001 605,20-
   *
   * NON usiamo:
   * - aliquota 33,0000
   * - imposta lorda 894,83
   * - progressivi.
   */
  const item =
    findItem(
      items,
      "121",
      /IRPEF\s+COD\.?\s*1001/i,
    );

  if (
    item?.amount !== null &&
    item?.amount !== undefined
  ) {
    return Math.abs(
      item.amount,
    );
  }

  return extractCodedAmount(
    text,
    ["121", "I21"],
    /IRPEF\s+COD\.?\s*1001/i,
    {
      pick: "last",
      maxFollowingLines: 2,
    },
  );
}

/*
 * ============================================================
 * IMPONIBILE FISCALE
 * ============================================================
 */

function extractTaxableIncome(
  text: string,
  items: PayrollImportItem[],
): number | null {
  const item =
    findItem(
      items,
      "101",
      /IMPON\.?\s*FISCALE\s+MESE/i,
    );

  if (
    item?.amount !== null &&
    item?.amount !== undefined
  ) {
    return Math.abs(
      item.amount,
    );
  }

  return extractCodedAmount(
    text,
    ["101"],
    /IMPON(?:IBILE)?\.?\s+FISCALE\s+MESE/i,
    {
      pick: "last",
      maxFollowingLines: 2,
    },
  );
}

/*
 * ============================================================
 * TFR
 * ============================================================
 */

function extractTfrAccrual(
  text: string,
): number | null {
  const lines =
    linesOf(text);

  const patterns = [
    /\bTFR\s+MESE\b/i,
    /\bTFR\s+MATURAT[OA]\s+(?:NEL\s+)?MESE\b/i,
    /\bQUOTA\s+TFR\s+MATURAT[AA]\b/i,
  ];

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    for (const pattern of patterns) {
      pattern.lastIndex = 0;

      const match =
        pattern.exec(
          lines[index],
        );

      if (!match) {
        continue;
      }

      /*
       * Escludiamo esplicitamente
       * "Quota TFR Fdo Tesor. INPS".
       */
      if (
        /FDO\s+TESOR|TESORERIA\s+INPS/i.test(
          lines[index],
        )
      ) {
        continue;
      }

      const after =
        lines[index].slice(
          match.index +
            match[0].length,
        );

      const sameLine =
        lastMoneyFrom(after);

      if (sameLine !== null) {
        return Math.abs(
          sameLine,
        );
      }

      const next =
        lines[index + 1];

      if (next) {
        const nextValue =
          firstMoneyFrom(next);

        if (
          nextValue !== null
        ) {
          return Math.abs(
            nextValue,
          );
        }
      }
    }
  }

  return null;
}

function extractTfrInps(
  text: string,
  items: PayrollImportItem[],
): number | null {
  const item =
    findItem(
      items,
      "801",
      /QUOTA\s+TFR\s+FDO\s+TESOR/i,
    );

  if (
    item?.amount !== null &&
    item?.amount !== undefined
  ) {
    return Math.abs(
      item.amount,
    );
  }

  return extractCodedAmount(
    text,
    ["801"],
    /QUOTA\s+TFR\s+FDO\s+TESOR/i,
    {
      pick: "last",
      maxFollowingLines: 3,
    },
  );
}

/*
 * ============================================================
 * VOCI RETRIBUTIVE SPECIFICHE
 * ============================================================
 */

function extractPayrollItemAmount(
  text: string,
  items: PayrollImportItem[],
  codes: string[],
  description: RegExp,
): number {
  for (const code of codes) {
    const item =
      findItem(
        items,
        code,
        description,
      );

    if (
      item?.amount !== null &&
      item?.amount !== undefined
    ) {
      return Math.abs(
        item.amount,
      );
    }
  }

  return (
    extractCodedAmount(
      text,
      codes,
      description,
      {
        pick: "last",
        maxFollowingLines: 2,
      },
    ) ?? 0
  );
}

/*
 * ============================================================
 * CALENDARIO PRESENZE INAZ
 * ============================================================
 *
 * INAZ espone nella parte inferiore:
 *
 * PRESENZE MESE DI:
 * GIORNI
 * ...
 * ORDINARIE
 * 0800 0800 ...
 * SUPPLEMENTARI
 * STRAORDINARIE
 * 0100 0100 0400 ...
 *
 * Per ora salviamo soltanto il totale delle ore ordinarie
 * in worked_hours.
 *
 * Non salviamo ancora il dettaglio giornaliero perché il
 * modello PayrollImportNormalizedRow non dispone dei campi
 * necessari.
 */

type InazAttendanceTotals = {
  ordinaryHours: number;
  overtimeHours: number;
  supplementaryHours: number;
  ordinaryDetected: boolean;
  overtimeDetected: boolean;
  supplementaryDetected: boolean;
};

function parseAttendanceToken(
  raw: string,
): number | null {
  const token =
    raw
      .replace(/[^0-9]/g, "")
      .trim();

  /*
   * Formato INAZ tipico:
   *
   * 0800 = 8h00
   * 0100 = 1h00
   * 0400 = 4h00
   * 0730 = 7h30
   */
  if (token.length !== 4) {
    return null;
  }

  const hours =
    Number(
      token.slice(0, 2),
    );

  const minutes =
    Number(
      token.slice(2, 4),
    );

  if (
    !Number.isInteger(hours) ||
    !Number.isInteger(minutes) ||
    hours < 0 ||
    hours > 24 ||
    minutes < 0 ||
    minutes >= 60
  ) {
    return null;
  }

  return (
    hours +
    minutes / 60
  );
}

function extractAttendanceTokens(
  value: string,
): number[] {
  /*
   * L'OCR può produrre:
   *
   * 0800
   * 08000800
   * 080008000800
   *
   * Perciò riconosciamo sequenze composte
   * da blocchi di quattro cifre.
   */
  const compact =
    value.replace(
      /[^0-9]/g,
      "",
    );

  if (
    compact.length < 4
  ) {
    return [];
  }

  const values: number[] = [];

  /*
   * Prima proviamo i token espliciti.
   */
  const explicit =
    value.match(
      /\b\d{4}\b/g,
    ) ?? [];

  for (const token of explicit) {
    const parsed =
      parseAttendanceToken(
        token,
      );

    if (parsed !== null) {
      values.push(parsed);
    }
  }

  if (values.length) {
    return values;
  }

  /*
   * Fallback per token concatenati:
   *
   * 080008000800
   */
  if (
    compact.length % 4 !== 0
  ) {
    return [];
  }

  for (
    let index = 0;
    index < compact.length;
    index += 4
  ) {
    const parsed =
      parseAttendanceToken(
        compact.slice(
          index,
          index + 4,
        ),
      );

    if (parsed !== null) {
      values.push(parsed);
    }
  }

  return values;
}

function parseInazAttendanceCalendar(
  text: string,
): InazAttendanceTotals {
  const lines = linesOf(text);

  const result: InazAttendanceTotals = {
    ordinaryHours: 0,
    overtimeHours: 0,
    supplementaryHours: 0,
    ordinaryDetected: false,
    overtimeDetected: false,
    supplementaryDetected: false,
  };

  const startIndex = findLineIndex(
    lines,
    /PRESENZE\s+MESE\s+DI/i,
  );

  if (startIndex < 0) {
    return result;
  }

  /*
   * Il calendario INAZ è normalmente nella parte finale
   * del cedolino.
   *
   * L'OCR AUTO tende a concatenare le celle:
   *
   *   080008000800...
   *   010001000400...
   *
   * mentre OCR SPARSE può separarle su più righe.
   *
   * Per questo lavoriamo per sezioni e non per coordinate.
   */
  const attendanceLines = lines.slice(
    startIndex,
    Math.min(lines.length, startIndex + 120),
  );

  type Section =
    | "ordinary"
    | "supplementary"
    | "overtime"
    | null;

  let section: Section = null;

  const addValues = (
    target: "ordinaryHours" | "supplementaryHours" | "overtimeHours",
    line: string,
  ) => {
    const values = extractAttendanceTokens(line);

    if (!values.length) {
      return;
    }

    /*
     * Una singola cella giornaliera INAZ non deve
     * rappresentare più di 24 ore.
     *
     * extractAttendanceTokens esegue già questa verifica;
     * qui sommiamo solamente i token validi.
     */
    const total = values.reduce(
      (sum, value) => sum + value,
      0,
    );

    result[target] += total;
  };

  for (
    let index = 0;
    index < attendanceLines.length;
    index += 1
  ) {
    const line = attendanceLines[index];
    const normalized = normalizeForDetection(line);

    /*
     * Fine effettiva del calendario.
     *
     * Evitiamo di continuare a interpretare come ore
     * numeri appartenenti alla stampa o ad altre sezioni.
     */
    if (
      /DATA\s+DI\s+STAMPA/.test(normalized) ||
      /ELABORATO\s+DA/.test(normalized)
    ) {
      break;
    }

    /*
     * ORDINARIE
     */
    if (
      /\bORDINARIE\b/.test(normalized) &&
      !/\bSTRAORDINARIE\b/.test(normalized)
    ) {
      section = "ordinary";
      result.ordinaryDetected = true;

      const afterLabel = line.replace(
        /.*?\bORDINARIE\b/i,
        "",
      );

      addValues(
        "ordinaryHours",
        afterLabel,
      );

      continue;
    }

    /*
     * SUPPLEMENTARI
     */
    if (
      /\bSUPPLEMENTARI\b/.test(normalized)
    ) {
      section = "supplementary";
      result.supplementaryDetected = true;

      const afterLabel = line.replace(
        /.*?\bSUPPLEMENTARI\b/i,
        "",
      );

      addValues(
        "supplementaryHours",
        afterLabel,
      );

      continue;
    }

    /*
     * STRAORDINARIE
     */
    if (
      /\bSTRAORDINARIE\b/.test(normalized)
    ) {
      section = "overtime";
      result.overtimeDetected = true;

      const afterLabel = line.replace(
        /.*?\bSTRAORDINARIE\b/i,
        "",
      );

      addValues(
        "overtimeHours",
        afterLabel,
      );

      continue;
    }

    /*
     * Le righe "Causale" appartengono ancora al calendario,
     * ma da questo punto non dobbiamo più leggere i numeri
     * come ore della sezione precedente.
     */
    if (
      /\bCAUSALE\b/.test(normalized)
    ) {
      section = null;
      continue;
    }

    if (!section) {
      continue;
    }

    /*
     * Non interpretiamo come ore:
     * - intestazione giorni;
     * - numerazione dei giorni;
     * - mese.
     */
    if (
      /\bGIORNI\b/.test(normalized) ||
      /\bLUGLIO\b/.test(normalized) ||
      /\bAGOSTO\b/.test(normalized) ||
      /\bSETTEMBRE\b/.test(normalized) ||
      /\bOTTOBRE\b/.test(normalized) ||
      /\bNOVEMBRE\b/.test(normalized) ||
      /\bDICEMBRE\b/.test(normalized) ||
      /\bGENNAIO\b/.test(normalized) ||
      /\bFEBBRAIO\b/.test(normalized) ||
      /\bMARZO\b/.test(normalized) ||
      /\bAPRILE\b/.test(normalized) ||
      /\bMAGGIO\b/.test(normalized) ||
      /\bGIUGNO\b/.test(normalized)
    ) {
      continue;
    }

    if (section === "ordinary") {
      addValues(
        "ordinaryHours",
        line,
      );
    } else if (
      section === "supplementary"
    ) {
      addValues(
        "supplementaryHours",
        line,
      );
    } else if (
      section === "overtime"
    ) {
      addValues(
        "overtimeHours",
        line,
      );
    }
  }

  /*
   * ----------------------------------------------------------
   * FALLBACK DALLE VOCI PAGA
   * ----------------------------------------------------------
   *
   * Il calendario è la fonte preferita.
   *
   * Se però l'OCR non riesce a leggere correttamente la
   * riga STRAORDINARIE, possiamo recuperare le ore dalle
   * voci paga INAZ.
   *
   * Esempio reale:
   *
   * 013 Straordinario 20% 30,0000 ...
   * 219 Ore Viaggio       10,0000 ...
   *
   * ATTENZIONE:
   * "Ore Viaggio" NON viene considerato straordinario.
   * Qui recuperiamo esclusivamente voci esplicitamente
   * identificate come straordinario.
   */
  if (
    !result.overtimeDetected ||
    result.overtimeHours === 0
  ) {
    let fallbackOvertime = 0;

    for (const line of lines) {
      if (
        !/\bSTRAORDINAR/i.test(line)
      ) {
        continue;
      }

      /*
       * Cerchiamo la quantità subito successiva
       * alla descrizione.
       *
       * Esempio:
       *
       * 013 Straordinario 20% 30,0000 20,07545 602,26
       *
       * Il "20%" è una percentuale, quindi non deve
       * diventare 20 ore.
       */
      const descriptionEnd = line.search(
        /\d+(?:,\d+)?\s*$/,
      );

      const tokens = moneyTokensFrom(line);

      /*
       * Normalmente:
       *
       * 20%      -> non viene catturato perché manca la virgola
       * 30,0000  -> quantità
       * 20,07545 -> base
       * 602,26   -> importo
       */
      if (tokens.length >= 3) {
        const quantity =
          Math.abs(tokens[0].value);

        if (
          quantity > 0 &&
          quantity <= 100
        ) {
          fallbackOvertime += quantity;
        }
      } else if (
        descriptionEnd >= 0 &&
        tokens.length
      ) {
        const quantity =
          Math.abs(tokens[0].value);

        if (
          quantity > 0 &&
          quantity <= 100
        ) {
          fallbackOvertime += quantity;
        }
      }
    }

    if (fallbackOvertime > 0) {
      result.overtimeHours =
        fallbackOvertime;

      result.overtimeDetected = true;
    }
  }

  /*
   * Arrotondamento finale.
   */
  result.ordinaryHours =
    Math.round(
      result.ordinaryHours * 100,
    ) / 100;

  result.overtimeHours =
    Math.round(
      result.overtimeHours * 100,
    ) / 100;

  result.supplementaryHours =
    Math.round(
      result.supplementaryHours * 100,
    ) / 100;

  return result;
}

/*
 * ============================================================
 * PARSER PRINCIPALE
 * ============================================================
 */

export function parseInazPayrollPage(
  text: string,
  pageNumber: number,
): PayrollImportNormalizedRow {
  const period =
    detectMonthYear(text);

  const items =
    parseInazItems(text);

  const employeeName =
    extractEmployeeName(text);

  const employeeCode =
    extractEmployeeCode(text);

  const employeeIdentifier =
    extractItalianTaxCode(text);

  /*
   * ----------------------------------------------------------
   * RIEPILOGO
   * ----------------------------------------------------------
   */

  const totals =
    extractInazTotals(text);

  const grossSalary =
    totals.totalEarnings;

  const netSalary =
    extractNetPay(text);

  /*
   * ----------------------------------------------------------
   * CONTRIBUTI / FISCO
   * ----------------------------------------------------------
   */

  const socialSecurityBase =
    extractSocialSecurityBase(
      text,
      items,
    );

  const employeeContributions =
    extractEmployeeContributions(
      text,
      items,
    );

  const taxableIncome =
    extractTaxableIncome(
      text,
      items,
    );

  const incomeTax =
    extractIncomeTax(
      text,
      items,
    );

  /*
   * ----------------------------------------------------------
   * TFR
   * ----------------------------------------------------------
   */

  const tfrAccrual =
    extractTfrAccrual(text);

  const tfrInps =
    extractTfrInps(
      text,
      items,
    );

  /*
   * ----------------------------------------------------------
   * VOCI RETRIBUTIVE
   * ----------------------------------------------------------
   */

  const reimbursements =
    extractPayrollItemAmount(
      text,
      items,
      ["116"],
      /\bTRASFERTA\s+ITALIA\b/i,
    );

  const otherEarnings =
    extractPayrollItemAmount(
      text,
      items,
      ["018"],
      /\bPREMIO\b/i,
    );

  const holidays =
    extractPayrollItemAmount(
      text,
      items,
      [],
      /\bFERIE\b/i,
    );

  const sickness =
    extractPayrollItemAmount(
      text,
      items,
      [],
      /\bMALATT/i,
    );

  const accident =
    extractPayrollItemAmount(
      text,
      items,
      [],
      /\bINFORTUN/i,
    );

  /*
   * ----------------------------------------------------------
   * CALENDARIO PRESENZE
   * ----------------------------------------------------------
   */

  const attendance =
    parseInazAttendanceCalendar(
      text,
    );

  /*
   * Per ora worked_hours contiene SOLO
   * le ore ordinarie lette dal calendario.
   *
   * Non sommiamo gli straordinari:
   * li conserveremo separatamente quando
   * estenderemo il modello dati.
   */
const workedHours =
    Math.round(
      (
        attendance.ordinaryHours +
        attendance.overtimeHours +
        attendance.supplementaryHours
      ) * 100,
    ) / 100;

  /*
   * ----------------------------------------------------------
   * WARNING
   * ----------------------------------------------------------
   */

  const warnings:
    PayrollImportWarning[] = [];

  if (!employeeName) {
    warnings.push({
      code:
        "EMPLOYEE_NOT_DETECTED",
      message:
        `Pagina ${pageNumber}: dipendente non rilevato.`,
    });
  }

  if (grossSalary === null) {
    warnings.push({
      code: "MISSING_GROSS",
      message:
        "Totale competenze non rilevato nel cedolino INAZ.",
    });
  }

  if (netSalary === null) {
    warnings.push({
      code: "MISSING_NET",
      message:
        "Netto a pagare non rilevato nel cedolino INAZ.",
    });
  }

  warnings.push({
    code:
      "MISSING_EMPLOYER_CONTRIBUTIONS",
    message:
      "I contributi a carico azienda non vengono dedotti dal cedolino: verificare/integrarli.",
  });

  warnings.push({
    code:
      "MISSING_COMPANY_COST",
    message:
      "Il costo azienda non viene calcolato automaticamente dal cedolino.",
  });

  /*
   * ----------------------------------------------------------
   * NOTE TECNICHE
   * ----------------------------------------------------------
   *
   * Le note servono anche per verificare il parser
   * durante questa fase di sviluppo.
   */

  const notes = [
    taxableIncome !== null
      ? `Imponibile fiscale mese rilevato: ${taxableIncome.toFixed(2)}`
      : null,

    totals.totalDeductions !== null
      ? `Totale ritenute rilevato: ${totals.totalDeductions.toFixed(2)}`
      : null,

    attendance.ordinaryDetected
      ? `Ore ordinarie calendario INAZ: ${attendance.ordinaryHours.toFixed(2)}`
      : null,

    attendance.overtimeDetected
      ? `Ore straordinarie calendario INAZ: ${attendance.overtimeHours.toFixed(2)}`
      : null,

    attendance.supplementaryDetected
      ? `Ore supplementari calendario INAZ: ${attendance.supplementaryHours.toFixed(2)}`
      : null,
  ]
    .filter(
      (value): value is string =>
        Boolean(value),
    )
    .join(" | ");

  /*
   * ----------------------------------------------------------
   * OUTPUT NORMALIZZATO
   * ----------------------------------------------------------
   */

  return {
    page_number: pageNumber,
    country: "ITA",

    detected_year:
      period.year,

    detected_month:
      period.month,

    employee_id: null,

    employee_code:
      employeeCode,

    employee_name:
      employeeName,

    employee_identifier:
      employeeIdentifier,

    gross_salary:
      grossSalary ?? 0,

    other_salary_items: 0,

    social_security_base:
      socialSecurityBase ?? 0,

    net_salary:
      netSalary ?? 0,

    /*
     * Non calcoliamo i contributi azienda
     * dal cedolino del dipendente.
     */
    employer_contributions: 0,

    employee_contributions:
      employeeContributions ?? 0,

    /*
     * TFR maturato del mese.
     *
     * NON viene confuso con la quota
     * Fondo Tesoreria INPS.
     */
    tfr_accrual:
      tfrAccrual ?? 0,

    /*
     * Quota Fondo Tesoreria INPS.
     */
    tfr_inps:
      tfrInps ?? 0,

    tfr_recovery: 0,

    reimbursements,

    sickness,

    accident,

    holidays,

    leave_amount: 0,

    income_tax:
      incomeTax ?? 0,

    tax_adjustments: 0,

    tax_refund_730: 0,

    supplementary_treatment: 0,

    pension_fund_employee: 0,

    pension_fund_employer: 0,

    loan_deductions: 0,

    fifth_assignment_deductions: 0,

    other_earnings:
      otherEarnings,

    other_deductions: 0,

    company_cost: 0,

    worked_hours:
      workedHours,

    allocation_hours: 0,

    notes:
      notes || null,

    items,

    warnings,

    raw_text: text,
  };
}