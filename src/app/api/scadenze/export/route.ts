import { NextRequest, NextResponse } from "next/server";
import {
    PDFDocument,
    PDFPage,
    StandardFonts,
    rgb,
} from "pdf-lib";
import fs from "node:fs/promises";
import path from "node:path";

import { getInvoiceDeadlineExportRows } from "@/lib/deadlines";
import { requirePagePermission } from "@/lib/permissions";

export const runtime = "nodejs";

type ExportDays = 7 | 30 | 60 | 90;

type ExportRow = Awaited<
    ReturnType<typeof getInvoiceDeadlineExportRows>
>[number];

export async function GET(request: NextRequest) {
    await requirePagePermission("deadline.read");

    const { searchParams } = new URL(request.url);
    const rawDays = searchParams.get("days");

    const allowedDays = ["7", "30", "60", "90"] as const;

    if (
        !rawDays ||
        !allowedDays.includes(
            rawDays as (typeof allowedDays)[number],
        )
    ) {
        return NextResponse.json(
            {
                error:
                    "Intervallo non valido. Usa 7, 30, 60 oppure 90 giorni.",
            },
            { status: 400 },
        );
    }

    const days = Number(rawDays) as ExportDays;

    const rows =
        await getInvoiceDeadlineExportRows(days);

    /*
     * Carta intestata SIMI:
     * viene utilizzata esclusivamente sulla prima pagina.
     */
    const letterheadPath = path.join(
        process.cwd(),
        "public",
        "pdf",
        "carta-intestata-simi-orizzontale.pdf",
    );

    const letterheadBytes =
        await fs.readFile(letterheadPath);

    const templateDocument =
        await PDFDocument.load(letterheadBytes);

    const pdf = await PDFDocument.create();

    const font = await pdf.embedFont(
        StandardFonts.Helvetica,
    );

    const boldFont = await pdf.embedFont(
        StandardFonts.HelveticaBold,
    );

    /*
     * Prima pagina = carta intestata originale.
     */
    const [templatePage] = await pdf.copyPages(
        templateDocument,
        [0],
    );

    pdf.addPage(templatePage);

    const firstPage = pdf.getPage(0);

    const {
        width: pageWidth,
        height: pageHeight,
    } = firstPage.getSize();

    /*
     * =====================================
     * LAYOUT GENERALE
     * =====================================
     */

    const left = 40;
    const tableWidth = 700;

    /*
     * Leggermente più alto rispetto alla
     * versione precedente per migliorare
     * la leggibilità con font 8.5.
     */
    const rowHeight = 24;

    const bottomLimit = 45;

    const tableFontSize = 8.5;
    const tableHeaderFontSize = 8.5;

    const columns = [
        {
            label: "Cod. eSolver",
            x: 40,
            width: 70,
        },
        {
            label: "Fornitore",
            x: 110,
            width: 145,
        },
        {
            label: "N. fattura",
            x: 255,
            width: 85,
        },
        {
            label: "N. eSolver",
            x: 340,
            width: 70,
        },
        {
            label: "Totale",
            x: 410,
            width: 75,
        },
        {
            label: "Pagamento",
            x: 485,
            width: 105,
        },
        {
            label: "Scadenza",
            x: 590,
            width: 80,
        },
        {
            label: "Ritardo",
            x: 670,
            width: 70,
        },
    ];

    /*
     * =====================================
     * HELPERS
     * =====================================
     */

    const truncate = (
        text: string,
        maxWidth: number,
        size: number,
    ) => {
        if (
            font.widthOfTextAtSize(
                text,
                size,
            ) <= maxWidth
        ) {
            return text;
        }

        let value = text;

        while (
            value.length > 1 &&
            font.widthOfTextAtSize(
                `${value}…`,
                size,
            ) > maxWidth
        ) {
            value = value.slice(0, -1);
        }

        return `${value}…`;
    };

    const formatPdfDate = (
        date: string,
    ) => {
        const [year, month, day] =
            date.split("-");

        return `${day}/${month}/${year}`;
    };

    const formatPdfMoney = (
        amount: number,
        currency: string,
    ) =>
        new Intl.NumberFormat("it-IT", {
            style: "currency",
            currency,
        }).format(amount);

    const paymentLabels: Record<
        string,
        string
    > = {
        bank_transfer: "Bonifico",
        sepa_direct_debit:
            "Addebito SEPA",
        cash: "Contanti",
        card: "Carta",
        cheque: "Assegno",
    };

    /*
     * Se la scadenza è relativa a una rata:
     *
     * € 1.250,00 - 2 di 4
     *
     * Altrimenti:
     *
     * € 5.800,00
     */
    const amountLabel = (
        row: ExportRow,
    ) => {
        if (
            row.installment_amount !== null &&
            row.installment_position !==
            null &&
            row.installment_count !== null
        ) {
            return `${formatPdfMoney(
                row.installment_amount,
                row.currency,
            )} - ${row.installment_position
                } di ${row.installment_count}`;
        }

        return formatPdfMoney(
            row.amount_total,
            row.currency,
        );
    };

    /*
     * =====================================
     * INTESTAZIONE TABELLA
     * =====================================
     */

    const drawTableHeader = (
        page: PDFPage,
        y: number,
    ) => {
        page.drawRectangle({
            x: left,
            y,
            width: tableWidth,
            height: rowHeight,
            color: rgb(
                0.93,
                0.93,
                0.93,
            ),
        });

        page.drawLine({
            start: {
                x: left,
                y: y + rowHeight,
            },
            end: {
                x: left + tableWidth,
                y: y + rowHeight,
            },
            thickness: 0.6,
            color: rgb(
                0.65,
                0.65,
                0.65,
            ),
        });

        page.drawLine({
            start: {
                x: left,
                y,
            },
            end: {
                x: left + tableWidth,
                y,
            },
            thickness: 0.6,
            color: rgb(
                0.65,
                0.65,
                0.65,
            ),
        });

        for (const column of columns) {
            page.drawText(
                column.label,
                {
                    x: column.x + 3,
                    y: y + 8,
                    size:
                        tableHeaderFontSize,
                    font: boldFont,
                    color: rgb(
                        0,
                        0,
                        0,
                    ),
                },
            );
        }
    };

    /*
     * =====================================
     * RIGA TABELLA
     * =====================================
     */

    const drawRow = (
        page: PDFPage,
        row: ExportRow,
        y: number,
    ) => {
        page.drawLine({
            start: {
                x: left,
                y,
            },
            end: {
                x: left + tableWidth,
                y,
            },
            thickness: 0.4,
            color: rgb(
                0.8,
                0.8,
                0.8,
            ),
        });

        const values = [
            row.supplier_esolver_code ??
            "—",

            row.supplier_name,


            row.invoice_number,

            row.invoice_esolver_number ??
            "—",

            amountLabel(row),

            paymentLabels[
            row.payment_method ?? ""
            ] ??
            row.payment_method ??
            "—",

            formatPdfDate(
                row.due_date,
            ),

            row.days_overdue
                ? `${row.days_overdue} gg`
                : "—",
        ];

        values.forEach(
            (value, columnIndex) => {
                const column =
                    columns[columnIndex];

                page.drawText(
                    truncate(
                        String(value),
                        column.width - 6,
                        tableFontSize,
                    ),
                    {
                        x: column.x + 3,
                        y: y + 8,
                        size: tableFontSize,
                        font,
                        color: rgb(
                            0,
                            0,
                            0,
                        ),
                    },
                );
            },
        );
    };

    /*
     * =====================================
     * PRIMA PAGINA
     * =====================================
     */

    const titleY = 385;
    const subtitleY = 367;
    const totalY = 351;

    firstPage.drawText(
        "SCADENZIARIO FORNITORI",
        {
            x: left,
            y: titleY,
            size: 16,
            font: boldFont,
            color: rgb(0, 0, 0),
        },
    );

    firstPage.drawText(
        `Fatture scadute e in scadenza nei prossimi ${days} giorni`,
        {
            x: left,
            y: subtitleY,
            size: 9,
            font,
            color: rgb(
                0.25,
                0.25,
                0.25,
            ),
        },
    );

    firstPage.drawText(
        `Totale scadenze: ${rows.length}`,
        {
            x: left,
            y: totalY,
            size: 9,
            font,
            color: rgb(
                0.25,
                0.25,
                0.25,
            ),
        },
    );

    /*
     * La prima pagina ha meno spazio
     * disponibile a causa dell'intestazione.
     */
    const firstTableTop = 325;

    drawTableHeader(
        firstPage,
        firstTableTop,
    );

    let rowIndex = 0;

    let currentY =
        firstTableTop - rowHeight;

    while (
        rowIndex < rows.length &&
        currentY >= bottomLimit
    ) {
        drawRow(
            firstPage,
            rows[rowIndex],
            currentY,
        );

        rowIndex++;
        currentY -= rowHeight;
    }

    /*
     * =====================================
     * PAGINE SUCCESSIVE
     * =====================================
     */

    while (rowIndex < rows.length) {
        /*
         * Pagine successive bianche,
         * senza carta intestata.
         */
        const page = pdf.addPage([
            pageWidth,
            pageHeight,
        ]);

        page.drawText(
            "SCADENZIARIO FORNITORI",
            {
                x: left,
                y: pageHeight - 40,
                size: 12,
                font: boldFont,
                color: rgb(
                    0,
                    0,
                    0,
                ),
            },
        );

        page.drawText(
            `Fatture scadute e in scadenza nei prossimi ${days} giorni`,
            {
                x: left,
                y: pageHeight - 56,
                size: 8,
                font,
                color: rgb(
                    0.35,
                    0.35,
                    0.35,
                ),
            },
        );

        const tableTop =
            pageHeight - 85;

        drawTableHeader(
            page,
            tableTop,
        );

        currentY =
            tableTop - rowHeight;

        while (
            rowIndex < rows.length &&
            currentY >= bottomLimit
        ) {
            drawRow(
                page,
                rows[rowIndex],
                currentY,
            );

            rowIndex++;
            currentY -= rowHeight;
        }
    }

    /*
     * =====================================
     * NUMERAZIONE PAGINE
     * =====================================
     */

    const pages = pdf.getPages();
    const totalPages = pages.length;

    pages.forEach(
        (page, index) => {
            const label = `Pagina ${index + 1
                } di ${totalPages}`;

            const textWidth =
                font.widthOfTextAtSize(
                    label,
                    8,
                );

            page.drawText(label, {
                x:
                    page.getWidth() -
                    textWidth -
                    40,
                y: 20,
                size: 8,
                font,
                color: rgb(
                    0.4,
                    0.4,
                    0.4,
                ),
            });
        },
    );

    /*
     * =====================================
     * OUTPUT
     * =====================================
     */

    const pdfBytes =
        await pdf.save();

    return new NextResponse(
        Buffer.from(pdfBytes),
        {
            status: 200,

            headers: {
                "Content-Type":
                    "application/pdf",

                "Content-Disposition":
                    `attachment; filename="scadenziario-fornitori-${days}-giorni.pdf"`,

                "Cache-Control":
                    "no-store",
            },
        },
    );
}