import os from "os";
import {
  createWorker,
  PSM,
} from "tesseract.js";
import {
  extractText,
  getDocumentProxy,
  renderPageAsImage,
} from "unpdf";
import type { PayrollImportPage } from "./types";

export const PAYROLL_IMPORT_MAX_FILE_SIZE_BYTES =
  10 * 1024 * 1024;

const MIN_TEXT_LENGTH = 20;

const OCR_AUTO_RENDER_SCALE = 2;
const OCR_SPARSE_RENDER_SCALE = 3;
const OCR_ATTENDANCE_RENDER_SCALE = 4;

const OCR_PAGE_TIMEOUT_MS = 120_000;
const MAX_OCR_PAGES = 30;

/*
 * Fascia inferiore utilizzata per cercare il calendario
 * presenze INAZ.
 *
 * Il crop è volutamente ampio: non rappresenta le coordinate
 * del calendario di uno specifico cedolino.
 */
const ATTENDANCE_CROP_TOP_RATIO = 0.60;
const ATTENDANCE_DARK_THRESHOLD = 185;
const ATTENDANCE_LINE_DENSITY = 0.16;
const ATTENDANCE_LINE_MERGE_DISTANCE = 4;
const INAZ_ATTENDANCE_COLUMNS_MARKER = "=== INAZ ATTENDANCE COLUMNS ===";

const OCR_AUTO_MARKER =
  "=== OCR AUTO ===";

const OCR_SPARSE_MARKER =
  "=== OCR SPARSE ===";

const OCR_ATTENDANCE_MARKER =
  "=== OCR ATTENDANCE ===";

function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  message: string,
): Promise<T> {
  return new Promise(
    (resolve, reject) => {
      const timer = setTimeout(
        () =>
          reject(
            new Error(message),
          ),
        ms,
      );

      promise.then(
        (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        (error) => {
          clearTimeout(timer);
          reject(error);
        },
      );
    },
  );
}

function cleanOcrText(
  value: string,
): string {
  return value
    .replace(/\r/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function hasUsablePdfText(
  text: string,
): boolean {
  const cleaned =
    text.trim();

  if (
    cleaned.length <
    MIN_TEXT_LENGTH
  ) {
    return false;
  }

  const alphanumericCount =
    cleaned.match(
      /[A-Za-zÀ-ÖØ-öø-ÿ0-9]/g,
    )?.length ?? 0;

  return (
    alphanumericCount >=
    MIN_TEXT_LENGTH
  );
}

function toBuffer(
  value:
    | ArrayBuffer
    | Uint8Array,
): Buffer {
  if (
    value instanceof
    Uint8Array
  ) {
    return Buffer.from(
      value.buffer,
      value.byteOffset,
      value.byteLength,
    );
  }

  return Buffer.from(
    new Uint8Array(value),
  );
}

/*
 * Ritaglia una fascia dell'immagine.
 */
async function cropImageRegion(
  imageBuffer:
    | ArrayBuffer
    | Uint8Array,
  topRatio: number,
): Promise<Buffer> {
  const {
    createCanvas,
    loadImage,
  } = await import(
    "@napi-rs/canvas"
  );

  const sourceBuffer =
    toBuffer(imageBuffer);

  const image =
    await loadImage(
      sourceBuffer,
    );

  const sourceWidth =
    image.width;

  const sourceHeight =
    image.height;

  if (
    sourceWidth <= 0 ||
    sourceHeight <= 0
  ) {
    throw new Error(
      "Impossibile leggere l'immagine del cedolino.",
    );
  }

  const safeTopRatio =
    Math.min(
      Math.max(
        topRatio,
        0,
      ),
      0.95,
    );

  const cropTop =
    Math.floor(
      sourceHeight *
        safeTopRatio,
    );

  const cropHeight =
    sourceHeight -
    cropTop;

  if (
    cropHeight <= 0
  ) {
    throw new Error(
      "Impossibile ritagliare la sezione presenze del cedolino.",
    );
  }

  const canvas =
    createCanvas(
      sourceWidth,
      cropHeight,
    );

  const context =
    canvas.getContext(
      "2d",
    );

  context.drawImage(
    image,
    0,
    cropTop,
    sourceWidth,
    cropHeight,
    0,
    0,
    sourceWidth,
    cropHeight,
  );

  return canvas.toBuffer(
    "image/png",
  );
}

/*
 * Tenta di capire se la fascia inferiore contiene davvero
 * un calendario presenze.
 *
 * Non viene usato per stabilire se la pagina è un cedolino:
 * serve solamente a evitare che un adapter futuro interpreti
 * come calendario una zona completamente diversa.
 */
function looksLikeAttendanceSection(
  text: string,
): boolean {
  const normalized =
    text
      .toUpperCase()
      .replace(
        /\s+/g,
        " ",
      );

  const signals = [
    "PRESENZE",
    "ORDINARIE",
    "STRAORDINARIE",
    "SUPPLEMENTARI",
    "CAUSALE",
    "GIORNI",
  ];

  const matches =
    signals.filter(
      (signal) =>
        normalized.includes(
          signal,
        ),
    ).length;

  /*
   * Il riconoscimento OCR della testata può essere imperfetto.
   * Due segnali strutturali sono sufficienti per mantenere
   * il blocco come possibile calendario.
   */
  return matches >= 2;
}

/*
 * OCR generale della pagina.
 */
async function recognizeAuto(
  worker: Awaited<
    ReturnType<
      typeof createWorker
    >
  >,
  imageBuffer:
    | ArrayBuffer
    | Uint8Array,
): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode:
      PSM.AUTO,
    preserve_interword_spaces:
      "1",
  });

  const result =
    await worker.recognize(
      toBuffer(
        imageBuffer,
      ),
    );

  return cleanOcrText(
    result.data.text ?? "",
  );
}

/*
 * OCR SPARSE della pagina.
 *
 * È utile soprattutto per i numeri piccoli nelle tabelle
 * economiche e contributive.
 */
async function recognizeSparse(
  worker: Awaited<
    ReturnType<
      typeof createWorker
    >
  >,
  imageBuffer:
    | ArrayBuffer
    | Uint8Array,
): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode:
      PSM.SPARSE_TEXT,
    preserve_interword_spaces:
      "1",
  });

  const result =
    await worker.recognize(
      toBuffer(
        imageBuffer,
      ),
    );

  return cleanOcrText(
    result.data.text ?? "",
  );
}

/*
 * OCR dedicato alla zona presenze.
 *
 * SPARSE_TEXT è intenzionale.
 *
 * SINGLE_BLOCK tende a fondere le celle orizzontali
 * della griglia INAZ in stringhe ancora più difficili
 * da interpretare.
 *
 * SPARSE_TEXT lascia invece più libertà a Tesseract
 * nell'individuare i singoli elementi della tabella.
 */
async function recognizeAttendance(
  worker: Awaited<
    ReturnType<
      typeof createWorker
    >
  >,
  imageBuffer: Buffer,
): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode:
      PSM.SPARSE_TEXT,
    preserve_interword_spaces:
      "1",

    /*
     * Il calendario contiene quasi esclusivamente:
     * - numeri;
     * - separatori;
     * - sigle causali;
     * - intestazioni.
     *
     * Non impostiamo una whitelist perché eliminerebbe
     * parole come ORDINARIE, STRAORDINARIE e le causali.
     */
  });

  const result =
    await worker.recognize(
      imageBuffer,
    );

  return cleanOcrText(
    result.data.text ?? "",
  );
}

async function recognizeAttendanceColumns(
  worker: Awaited<ReturnType<typeof createWorker>>,
  imageBuffer: Buffer,
): Promise<string | null> {
  const { createCanvas, loadImage } = await import("@napi-rs/canvas");
  const image = await loadImage(imageBuffer);
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0);

  const imageData = context.getImageData(0, 0, image.width, image.height);
  const { data } = imageData;
  const width = image.width;
  const height = image.height;
  const searchTop = Math.floor(height * 0.35);

  const isDark = (x: number, y: number): boolean => {
    const offset = (y * width + x) * 4;
    const luminance =
      data[offset] * 0.299 +
      data[offset + 1] * 0.587 +
      data[offset + 2] * 0.114;
    return luminance < ATTENDANCE_DARK_THRESHOLD;
  };

  const rawLines: number[] = [];
  for (let x = 0; x < width; x += 1) {
    let dark = 0;
    let samples = 0;
    for (let y = searchTop; y < height; y += 2) {
      samples += 1;
      if (isDark(x, y)) dark += 1;
    }
    if (samples && dark / samples >= ATTENDANCE_LINE_DENSITY) {
      rawLines.push(x);
    }
  }

  if (!rawLines.length) return null;

  const clustered: number[] = [];
  let group: number[] = [rawLines[0]];
  for (let index = 1; index < rawLines.length; index += 1) {
    const value = rawLines[index];
    if (value - group[group.length - 1] <= ATTENDANCE_LINE_MERGE_DISTANCE) {
      group.push(value);
    } else {
      clustered.push(Math.round(group.reduce((a, b) => a + b, 0) / group.length));
      group = [value];
    }
  }
  clustered.push(Math.round(group.reduce((a, b) => a + b, 0) / group.length));

  /*
   * Cerchiamo la sequenza più lunga di separatori quasi equidistanti.
   * Non imponiamo coordinate assolute: la larghezza viene ricavata
   * dalla griglia stessa.
   */
  let best: number[] = [];
  for (let start = 0; start < clustered.length; start += 1) {
    for (let end = start + 25; end < clustered.length && end <= start + 36; end += 1) {
      const candidate = clustered.slice(start, end + 1);
      const gaps = candidate.slice(1).map((x, i) => x - candidate[i]);
      const sorted = [...gaps].sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
      if (median < 8) continue;
      const good = gaps.filter((gap) => Math.abs(gap - median) <= median * 0.4).length;
      if (good / gaps.length >= 0.75 && candidate.length > best.length) best = candidate;
    }
  }

  if (best.length < 26) return null;

  const columns = best.slice(0, -1).slice(0, 31);
  const output: string[] = [
    INAZ_ATTENDANCE_COLUMNS_MARKER,
    `DETECTED_COLUMNS=${columns.length}`,
  ];

  for (let index = 0; index < columns.length; index += 1) {
    const left = best[index];
    const right = best[index + 1];
    if (right - left < 6) continue;

    const padding = 2;
    const cellWidth = Math.max(1, right - left - padding * 2);
    const cellHeight = Math.max(1, height - searchTop);
    const cellCanvas = createCanvas(cellWidth * 3, cellHeight * 3);
    const cellContext = cellCanvas.getContext("2d");
    cellContext.drawImage(
      image,
      left + padding,
      searchTop,
      cellWidth,
      cellHeight,
      0,
      0,
      cellWidth * 3,
      cellHeight * 3,
    );

    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SPARSE_TEXT,
      preserve_interword_spaces: "1",
    });

    const result = await worker.recognize(cellCanvas.toBuffer("image/png"));
    const value = cleanOcrText(result.data.text ?? "")
      .replace(/\n+/g, "/")
      .replace(/\s+/g, " ")
      .trim();

    output.push(`DAYCOL=${String(index + 1).padStart(2, "0")}|${value}`);
  }

  return output.length > 2 ? output.join("\\n") : null;
}

async function ocrPage(
  pdf: Awaited<
    ReturnType<
      typeof getDocumentProxy
    >
  >,
  pageNumber: number,
): Promise<string> {
  /*
   * ========================================================
   * RENDER AUTO
   * ========================================================
   */
  const autoImageBuffer =
    await renderPageAsImage(
      pdf,
      pageNumber,
      {
        scale:
          OCR_AUTO_RENDER_SCALE,

        canvasImport: () =>
          import(
            "@napi-rs/canvas"
          ),
      },
    );

  /*
   * ========================================================
   * RENDER SPARSE
   * ========================================================
   */
  const sparseImageBuffer =
    await renderPageAsImage(
      pdf,
      pageNumber,
      {
        scale:
          OCR_SPARSE_RENDER_SCALE,

        canvasImport: () =>
          import(
            "@napi-rs/canvas"
          ),
      },
    );

  /*
   * ========================================================
   * RENDER PRESENZE
   * ========================================================
   *
   * Utilizziamo un render separato e più grande.
   */
  const attendanceImageBuffer =
    await renderPageAsImage(
      pdf,
      pageNumber,
      {
        scale:
          OCR_ATTENDANCE_RENDER_SCALE,

        canvasImport: () =>
          import(
            "@napi-rs/canvas"
          ),
      },
    );

  /*
   * Isoliamo la fascia inferiore prima dell'OCR.
   */
  const attendanceCrop =
    await cropImageRegion(
      attendanceImageBuffer,
      ATTENDANCE_CROP_TOP_RATIO,
    );

  const worker =
    await createWorker(
      [
        "ita",
        "fra",
      ],
      1,
      {
        cachePath:
          os.tmpdir(),
      },
    );

  try {
    /*
     * ======================================================
     * PASSAGGIO 1 — AUTO
     * ======================================================
     */
    const autoText =
      await recognizeAuto(
        worker,
        autoImageBuffer,
      );

    /*
     * ======================================================
     * PASSAGGIO 2 — SPARSE
     * ======================================================
     */
    const sparseText =
      await recognizeSparse(
        worker,
        sparseImageBuffer,
      );

    /*
     * ======================================================
     * PASSAGGIO 3 — ATTENDANCE
     * ======================================================
     */
    const attendanceText =
      await recognizeAttendance(
        worker,
        attendanceCrop,
      );

    const attendanceColumns =
      looksLikeAttendanceSection(attendanceText)
        ? await recognizeAttendanceColumns(
            worker,
            attendanceCrop,
          )
        : null;

    const sections: string[] =
      [
        OCR_AUTO_MARKER,
        autoText,
        "",
        OCR_SPARSE_MARKER,
        sparseText,
      ];

    /*
     * Durante lo sviluppo manteniamo comunque il risultato
     * dell'OCR attendance se contiene testo.
     *
     * Aggiungiamo inoltre un marker esplicito che indica
     * se la zona è stata riconosciuta come probabile
     * calendario.
     *
     * Questo NON determina i valori importati.
     */
    if (
      attendanceText.length >
      0
    ) {
      sections.push(
        "",
        OCR_ATTENDANCE_MARKER,
        looksLikeAttendanceSection(
          attendanceText,
        )
          ? "ATTENDANCE_LAYOUT=DETECTED"
          : "ATTENDANCE_LAYOUT=UNCONFIRMED",
        attendanceText,
      );
    }

    if (attendanceColumns) {
      sections.push(
        "",
        attendanceColumns,
      );
    }

    return sections
      .join("\n")
      .trim();
  } finally {
    await worker.terminate();
  }
}

export async function extractPayrollPdfPages(
  file: File,
): Promise<
  PayrollImportPage[]
> {
  if (
    file.type !==
    "application/pdf"
  ) {
    throw new Error(
      "Il file deve essere in formato PDF.",
    );
  }

  if (
    file.size <= 0
  ) {
    throw new Error(
      "Seleziona un PDF valido.",
    );
  }

  if (
    file.size >
    PAYROLL_IMPORT_MAX_FILE_SIZE_BYTES
  ) {
    throw new Error(
      "Il PDF supera la dimensione massima di 10MB.",
    );
  }

  const buffer =
    Buffer.from(
      await file.arrayBuffer(),
    );

  const pdf =
    await getDocumentProxy(
      new Uint8Array(
        buffer,
      ),
    );

  const extracted =
    await extractText(
      pdf,
      {
        mergePages: false,
      },
    );

  const rawPages =
    Array.isArray(
      extracted.text,
    )
      ? extracted.text
      : [
          String(
            extracted.text ??
              "",
          ),
        ];

  const pages:
    PayrollImportPage[] =
    [];

  let ocrPages = 0;

  for (
    let index = 0;
    index < pdf.numPages;
    index += 1
  ) {
    const nativeText =
      String(
        rawPages[index] ??
          "",
      ).trim();

    let text =
      nativeText;

    let usedOcr =
      false;

    /*
     * Se il PDF contiene già testo reale, lo utilizziamo.
     *
     * L'OCR viene eseguito soltanto sulle pagine scannerizzate
     * o prive di testo utilizzabile.
     */
    if (
      !hasUsablePdfText(
        nativeText,
      )
    ) {
      if (
        ocrPages >=
        MAX_OCR_PAGES
      ) {
        throw new Error(
          `Il PDF contiene più di ${MAX_OCR_PAGES} pagine che richiedono OCR. ` +
            "Dividilo in file più piccoli.",
        );
      }

      ocrPages += 1;

      text =
        await withTimeout(
          ocrPage(
            pdf,
            index + 1,
          ),
          OCR_PAGE_TIMEOUT_MS,
          `OCR timeout alla pagina ${index + 1}.`,
        );

      usedOcr = true;
    }

    pages.push({
      page_number:
        index + 1,

      text:
        text.trim(),

      used_ocr:
        usedOcr,
    });
  }

  return pages;
}