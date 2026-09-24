import type {
  PayrollImportItem,
  PayrollImportNormalizedRow,
} from "../types";

import {
  detectMonthYear,
  parsePayrollNumber,
} from "../normalize";

import {
  isInazPayrollLayout,
  parseInazPayrollPage,
} from "./italy-inaz";

function cleanEmployeeName(
  value: string,
): string | null {
  const cleaned = value
    .replace(/[|[\]{}]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(
      /\s+\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?.*$/i,
      "",
    )
    .trim();

  if (cleaned.length < 5) {
    return null;
  }

  const forbidden = [
    "COMUNE DI RESIDENZA",
    "DATA NASCITA",
    "DATA ASSUNZIONE",
    "MATRICOLA INPS",
    "POSIZIONE INAIL",
    "CODICE FISCALE",
    "RETRIBUZIONE DI FATTO",
    "QUALIFICA",
    "LIVELLO",
    "CISANO BERGAMASCO",
  ];

  if (
    forbidden.includes(
      cleaned.toUpperCase(),
    )
  ) {
    return null;
  }

  return cleaned;
}

function isPlausibleEmployeeName(
  value: string,
): boolean {
  const tokens = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (
    tokens.length < 2 ||
    tokens.length > 5
  ) {
    return false;
  }

  return tokens.every((token) =>
    /^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'-]*$/.test(
      token,
    ),
  );
}

function extractEmployeeName(
  text: string,
): string | null {
  const labelledPatterns = [
    /(?:COGNOME\s+E\s+NOME|DIPENDENTE)\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý' -]{5,})/i,
    /(?:NOME\s+DIPENDENTE)\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý' -]{5,})/i,
  ];

  for (const pattern of labelledPatterns) {
    const match = text.match(pattern);

    if (!match?.[1]) {
      continue;
    }

    const firstLine =
      match[1].split(/\r?\n/)[0];

    const name =
      cleanEmployeeName(firstLine);

    if (
      name &&
      isPlausibleEmployeeName(
        name.toUpperCase(),
      )
    ) {
      return name;
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  /*
   * Layout Studio Valsecchi.
   *
   * Esempio OCR:
   * 151 |COLZANI MICHELE 20/01/25
   */
  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const window = lines
      .slice(index, index + 4)
      .join(" ");

    const match = window.match(
      /(?:^|\||\b\d{1,6}\s+)([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'-]+){1,3})\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    );

    if (!match?.[1]) {
      continue;
    }

    const name =
      cleanEmployeeName(match[1]);

    if (
      name &&
      isPlausibleEmployeeName(
        name.toUpperCase(),
      )
    ) {
      return name;
    }
  }

  /*
   * Fallback conservativo:
   * nome maiuscolo immediatamente
   * precedente una data.
   */
  for (const line of lines) {
    const match = line.match(
      /\b([A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'-]+(?:\s+[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý'-]+){1,3})\s+\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/,
    );

    if (!match?.[1]) {
      continue;
    }

    const name =
      cleanEmployeeName(match[1]);

    if (
      name &&
      isPlausibleEmployeeName(
        name.toUpperCase(),
      )
    ) {
      return name;
    }
  }

  return null;
}

function extractEmployeeCode(
  text: string,
): string | null {
  /*
   * Solo codici esplicitamente etichettati.
   * Non usiamo una generica "MATRICOLA",
   * perché può essere la matricola INPS.
   */
  const patterns = [
    /(?:COD\.?\s*DIPENDENTE|CODICE\s+DIPENDENTE)\s*[:\-]?\s*([A-Z0-9./-]+)/i,
    /(?:MATRICOLA\s+DIPENDENTE)\s*[:\-]?\s*([A-Z0-9./-]+)/i,
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match?.[1]) {
      return match[1].trim();
    }
  }

  return null;
}

function extractItalianTaxCode(
  text: string,
): string | null {
  const match = text
    .toUpperCase()
    .match(
      /\b[A-Z]{6}[0-9]{2}[A-Z][0-9]{2}[A-Z][0-9]{3}[A-Z]\b/,
    );

  return match?.[0] ?? null;
}

function getTextLines(
  text: string,
): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function extractNumbers(
  value: string,
): number[] {
  const matches = value.match(
    /-?\d{1,3}(?:\.\d{3})*(?:,\d+)|-?\d+(?:,\d+)?/g,
  );

  if (!matches) {
    return [];
  }

  return matches
    .map((match) =>
      parsePayrollNumber(match),
    )
    .filter(
      (value): value is number =>
        value !== null &&
        Number.isFinite(value),
    );
}

type LabelAmountOptions = {
  linesAfter?: number;
  pick?: "first" | "last";
  min?: number;
  max?: number;
};

function filterNumbers(
  numbers: number[],
  options: Pick<
    LabelAmountOptions,
    "min" | "max"
  >,
): number[] {
  return numbers.filter((number) => {
    if (
      options.min !== undefined &&
      number < options.min
    ) {
      return false;
    }

    if (
      options.max !== undefined &&
      number > options.max
    ) {
      return false;
    }

    return true;
  });
}

function findAmountNearLabel(
  text: string,
  labels: RegExp[],
  options: LabelAmountOptions = {},
): number | null {
  const lines = getTextLines(text);

  const {
    linesAfter = 2,
    pick = "first",
    min,
    max,
  } = options;

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const line = lines[index];

    for (const label of labels) {
      label.lastIndex = 0;

      const match = label.exec(line);

      if (!match) {
        continue;
      }

      const sameLine = line.slice(
        match.index + match[0].length,
      );

      let numbers =
        extractNumbers(sameLine);

      if (!numbers.length) {
        numbers = extractNumbers(
          lines
            .slice(
              index + 1,
              index + 1 + linesAfter,
            )
            .join(" "),
        );
      }

      numbers = filterNumbers(
        numbers,
        {
          min,
          max,
        },
      );

      if (!numbers.length) {
        continue;
      }

      return pick === "last"
        ? numbers[
            numbers.length - 1
          ]
        : numbers[0];
    }
  }

  return null;
}

function findAmountBetweenLabels(
  text: string,
  startLabels: RegExp[],
  endLabels: RegExp[],
  options: {
    pick?: "first" | "last";
    min?: number;
    max?: number;
    maxLines?: number;
  } = {},
): number | null {
  const lines = getTextLines(text);

  const maxLines =
    options.maxLines ?? 15;

  for (
    let start = 0;
    start < lines.length;
    start += 1
  ) {
    const isStart =
      startLabels.some((pattern) => {
        pattern.lastIndex = 0;
        return pattern.test(
          lines[start],
        );
      });

    if (!isStart) {
      continue;
    }

    let end = Math.min(
      start + maxLines,
      lines.length,
    );

    for (
      let index = start + 1;
      index <
      Math.min(
        start + maxLines,
        lines.length,
      );
      index += 1
    ) {
      const isEnd =
        endLabels.some((pattern) => {
          pattern.lastIndex = 0;
          return pattern.test(
            lines[index],
          );
        });

      if (isEnd) {
        end = index;
        break;
      }
    }

    let numbers = extractNumbers(
      lines
        .slice(start + 1, end)
        .join(" "),
    );

    numbers = filterNumbers(
      numbers,
      options,
    );

    if (!numbers.length) {
      continue;
    }

    return options.pick === "last"
      ? numbers[
          numbers.length - 1
        ]
      : numbers[0];
  }

  return null;
}

/*
 * =====================================================
 * LORDO — FALLBACK STRUTTURALE
 * =====================================================
 *
 * Alcuni OCR del layout Studio Valsecchi perdono
 * l'etichetta TOTALE LORDO ma conservano la struttura:
 *
 * IMPON. CONTR. SOC.  CONTRIBUTO 1 ...
 * 5.006,70 3.984,00 378,08 ...
 *
 * In questo caso:
 * - il secondo valore è l'imponibile contributivo;
 * - il primo è il totale lordo.
 *
 * Non utilizziamo importi specifici.
 */
function extractGrossFromContributionSummary(
  text: string,
): number | null {
  const lines = getTextLines(text);

  for (
    let index = 0;
    index < lines.length;
    index += 1
  ) {
    const header = lines[index];

    /*
     * Caso 1:
     * intestazione contributiva riconosciuta correttamente.
     *
     * Esempio:
     * IMPON. CONTR. SOC. CONTRIBUTO 1 ...
     */
    const hasReadableSocialHeader =
      /IMPON(?:IBILE)?\.?\s*CONTR/i.test(header) &&
      /CONTRIBUTO/i.test(header);

    /*
     * Caso 2:
     * intestazione degradata dall'OCR.
     *
     * Nel PDF reale può diventare, ad esempio:
     * "... CONTA SOC ... CONTR... ... TOTALE CONTR..."
     *
     * Non dipendiamo quindi dalla corretta lettura
     * della sola dicitura "IMPON. CONTR. SOC.".
     */
    const contributionTokens =
      (
        header.match(
          /CONTR(?:IBUTO|IBUTI|A|I|O)?/gi,
        ) ?? []
      ).length;

    const hasDegradedContributionHeader =
      contributionTokens >= 2 ||
      (
        /CONTR/i.test(header) &&
        /TOTALE/i.test(header)
      );

    if (
      !hasReadableSocialHeader &&
      !hasDegradedContributionHeader
    ) {
      continue;
    }

    /*
     * Nel layout orizzontale la riga immediatamente
     * successiva contiene:
     *
     * LORDO | IMPONIBILE CONTRIBUTIVO | CONTRIBUTI...
     *
     * Controlliamo al massimo le due righe successive.
     */
    for (
      let offset = 1;
      offset <= 2;
      offset += 1
    ) {
      const candidate =
        lines[index + offset];

      if (!candidate) {
        break;
      }

      const numbers =
        extractNumbers(candidate);

      /*
       * Servono almeno:
       * 1. lordo
       * 2. imponibile contributivo
       * 3. contributo
       */
      if (numbers.length < 3) {
        continue;
      }

      const candidateGross =
        numbers[0];

      const candidateSocialBase =
        numbers[1];

      const candidateContribution =
        numbers[2];

      /*
       * Validazione strutturale.
       *
       * Non utilizziamo importi hardcoded:
       * controlliamo soltanto che i rapporti tra
       * i valori siano compatibili con il blocco
       * contributivo del cedolino.
       */
      if (
        candidateGross <= 0 ||
        candidateSocialBase <= 0 ||
        candidateContribution < 0
      ) {
        continue;
      }

      if (
        candidateGross <
        candidateSocialBase
      ) {
        continue;
      }

      if (
        candidateSocialBase <
        candidateContribution
      ) {
        continue;
      }

      if (
        candidateContribution >
        candidateSocialBase * 0.5
      ) {
        continue;
      }

      return candidateGross;
    }
  }

  return null;
}

function parseItemLine(
  line: string,
): PayrollImportItem | null {
  const cleaned = line
    .replace(/^[\s[\]|]+/, "")
    .trim();

  const codeMatch = cleaned.match(
    /^(\d{2,6})\s+[\[|(]?\s*(.+)$/,
  );

  if (!codeMatch) {
    return null;
  }

  const code = codeMatch[1];
  const remainder =
    codeMatch[2].trim();

  const numberMatches = [
    ...remainder.matchAll(
      /-?\d{1,3}(?:\.\d{3})*(?:,\d+)|-?\d+(?:,\d+)?/g,
    ),
  ];

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

  let description = remainder
    .slice(
      0,
      firstNumber.index ?? 0,
    )
    .trim();

  let valueStartIndex = 0;

  if (
    firstNumber.index !== undefined &&
    remainder
      .slice(
        firstNumber.index +
          firstNumber[0].length,
      )
      .trimStart()
      .startsWith("%")
  ) {
    valueStartIndex = 1;

    const secondNumber =
      numberMatches[1];

    if (
      secondNumber?.index !==
      undefined
    ) {
      description = remainder
        .slice(
          0,
          secondNumber.index,
        )
        .trim();
    }
  }

  const values = numberMatches
    .slice(valueStartIndex)
    .map((match) =>
      parsePayrollNumber(match[0]),
    )
    .filter(
      (value): value is number =>
        value !== null,
    );

  const quantity =
    values.length >= 2
      ? values[0]
      : null;

  const base =
    values.length >= 3
      ? values[1]
      : null;

  const amount =
    values.length > 0
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

function parseItems(
  text: string,
): PayrollImportItem[] {
  const items = text
    .split(/\r?\n/)
    .flatMap((line) => {
      const item =
        parseItemLine(line);

      return item
        ? [item]
        : [];
    });

  /*
   * AUTO + SPARSE possono produrre
   * la stessa voce due volte.
   */
  const unique = new Map<
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
      unique.set(key, item);
    }
  }

  return [...unique.values()];
}

function extractWorkedHours(
  text: string,
): number | null {
  const ordinaryHours =
    findAmountNearLabel(
      text,
      [
        /(?:8001\s+)?LAVORO\s+ORDINARIO\s+(?:\(ORE\)|ORE)/i,
      ],
      {
        linesAfter: 2,
        pick: "first",
        min: 0,
        max: 400,
      },
    );

  if (ordinaryHours !== null) {
    return ordinaryHours;
  }

  /*
   * Non convertiamo giorni in ore e
   * non usiamo ORE CCNL / INPS / INAIL.
   */
  return null;
}

function sumItemAmounts(
  items: PayrollImportItem[],
  pattern: RegExp,
): number {
  return items
    .filter((item) => {
      pattern.lastIndex = 0;

      return pattern.test(
        item.description,
      );
    })
    .reduce(
      (total, item) =>
        total +
        (item.amount ?? 0),
      0,
    );
}

function extractReimbursements(
  items: PayrollImportItem[],
): number {
  return sumItemAmounts(
    items,
    /\bTRASFERT/i,
  );
}

function extractHolidays(
  items: PayrollImportItem[],
): number {
  return sumItemAmounts(
    items,
    /\bFERIE\b/i,
  );
}

function extractSickness(
  items: PayrollImportItem[],
): number {
  return sumItemAmounts(
    items,
    /\bMALATT/i,
  );
}

function extractAccident(
  items: PayrollImportItem[],
): number {
  return sumItemAmounts(
    items,
    /\bINFORTUN/i,
  );
}

function extractOtherEarnings(
  items: PayrollImportItem[],
): number {
  return sumItemAmounts(
    items,
    /\bPREMIO\b/i,
  );
}

export function parseGenericItalianPayrollPage(
  text: string,
  pageNumber: number,
): PayrollImportNormalizedRow {
  const period =
    detectMonthYear(text);

  const items =
    parseItems(text);

  const employeeName =
    extractEmployeeName(text);

  const employeeCode =
    extractEmployeeCode(text);

  const employeeIdentifier =
    extractItalianTaxCode(text);

  /*
   * =====================================================
   * TOTALI UFFICIALI
   * =====================================================
   */

  let gross =
    findAmountNearLabel(
      text,
      [
        /TOTALE\s+LORDO/i,
        /TOTALE\s+COMPETENZE/i,
      ],
      {
        linesAfter: 3,
        pick: "last",
        min: 0,
      },
    );

  /*
   * Se l'etichetta del lordo è stata persa
   * dall'OCR, usiamo la struttura del blocco
   * contributivo.
   */
  if (gross === null) {
    gross =
      extractGrossFromContributionSummary(
        text,
      );
  }

  const socialBase =
    findAmountNearLabel(
      text,
      [
        /IMPON\.?\s*CONTR\.?\s*S(?:OC|C)\.?/i,
        /IMPONIBILE\s+CONTRIBUTIVO/i,
      ],
      {
        linesAfter: 3,
        pick: "first",
        min: 0,
      },
    );

  /*
   * Sul layout corrente il totale contributi
   * è più affidabile nello SPARSE.
   */
  const employeeContrib =
    findAmountNearLabel(
      text,
      [
        /TOTALE\s+CONTRIBUTI\s+SOCIALI/i,
        /CONTRIBUTI\s+SOCIALI/i,
      ],
      {
        linesAfter: 5,
        pick: "last",
        min: 0,
      },
    );

  const net =
    findAmountNearLabel(
      text,
      [
        /NETTO\s+BUSTA/i,
        /RETTO\s+BUSTA/i,
      ],
      {
        linesAfter: 3,
        pick: "last",
        min: 0,
      },
    );

  /*
   * TFR:
   * nel layout corrente TFR MESE è
   * l'ultima colonna del blocco statistico.
   */
  let tfr =
    findAmountBetweenLabels(
      text,
      [
        /TFR\s*MESE/i,
      ],
      [
        /LAVORO\s+DIP/i,
        /CONIUGE/i,
        /DETRAZIONI\s+SPETTANTI/i,
      ],
      {
        pick: "last",
        min: 0,
        maxLines: 12,
      },
    );

  if (tfr === null) {
    tfr =
      findAmountNearLabel(
        text,
        [
          /TFR\s*MESE/i,
        ],
        {
          linesAfter: 10,
          pick: "last",
          min: 0,
        },
      );
  }

  /*
   * IRPEF MENSILE:
   *
   * usiamo TOTALE TRATTENUTE IRPEF.
   * Non usiamo IRPEF PAGATA, che nel blocco
   * progressivi è un valore cumulato annuale.
   */
  const incomeTax =
    findAmountNearLabel(
      text,
      [
        /TOTALE\s+TRATTENUTE\s+IRPEF(?!\s*T\.?\s*S\.?)/i,
        /IRPEF\s+NETTA/i,
      ],
      {
        linesAfter: 4,
        pick: "last",
        min: 0,
      },
    );

  const workedHours =
    extractWorkedHours(text);

  const reimbursements =
    extractReimbursements(items);

  const holidays =
    extractHolidays(items);

  const sickness =
    extractSickness(items);

  const accident =
    extractAccident(items);

  const otherEarnings =
    extractOtherEarnings(items);

  const warnings:
    PayrollImportNormalizedRow["warnings"] = [];

  if (!employeeName) {
    warnings.push({
      code: "EMPLOYEE_NOT_DETECTED",
      message:
        `Pagina ${pageNumber}: dipendente non rilevato.`,
    });
  }

  if (gross === null) {
    warnings.push({
      code: "MISSING_GROSS",
      message:
        "Totale lordo non rilevato.",
    });
  }

  if (net === null) {
    warnings.push({
      code: "MISSING_NET",
      message:
        "Netto busta non rilevato.",
    });
  }

  /*
   * Questi due valori NON vengono
   * inventati dal cedolino.
   */
  warnings.push({
    code:
      "MISSING_EMPLOYER_CONTRIBUTIONS",
    message:
      "I contributi a carico azienda non vengono dedotti dal cedolino: verificare/integrarli.",
  });

  warnings.push({
    code: "MISSING_COMPANY_COST",
    message:
      "Il costo azienda non viene calcolato automaticamente dal cedolino.",
  });

  return {
    page_number: pageNumber,
    country: "ITA",

    detected_year: period.year,
    detected_month: period.month,

    employee_id: null,
    employee_code: employeeCode,
    employee_name: employeeName,
    employee_identifier:
      employeeIdentifier,

    gross_salary: gross ?? 0,
    other_salary_items: 0,

    social_security_base:
      socialBase ?? 0,

    net_salary: net ?? 0,

    employer_contributions: 0,

    employee_contributions:
      employeeContrib ?? 0,

    tfr_accrual: tfr ?? 0,
    tfr_inps: 0,
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
      workedHours ?? 0,

    allocation_hours: 0,

    notes: null,

    items,

    warnings,

    raw_text: text,
  };
}

export function parseItalianPayrollPage(
  text: string,
  pageNumber: number,
): PayrollImportNormalizedRow {
  if (isInazPayrollLayout(text)) {
    return parseInazPayrollPage(
      text,
      pageNumber,
    );
  }

  return parseGenericItalianPayrollPage(
    text,
    pageNumber,
  );
}