import type { PayrollImportCountry } from "./types";
import { normalizeText } from "./normalize";

function scoreSignals(
  text: string,
  signals: Array<[string, number]>,
): number {
  return signals.reduce(
    (total, [signal, weight]) =>
      total + (text.includes(signal) ? weight : 0),
    0,
  );
}

export function detectPayrollCountry(
  text: string,
): PayrollImportCountry | null {
  const normalized = normalizeText(text);

  /*
   * LUXEMBOURG
   *
   * Alcuni termini sono francesi e potrebbero comparire anche
   * su un cedolino FRA. Per questo i segnali specificamente
   * lussemburghesi hanno un peso maggiore.
   */
  const luxScore = scoreSignals(normalized, [
    ["N CCSS", 4],
    ["CCSS", 3],
    ["S I M I LUXEMBOURG", 5],
    ["SIMI LUXEMBOURG", 5],
    ["LIVANGE", 4],
    ["ASSURANCE DEPENDANCE", 3],
    ["CAISSE MALADIE ESP", 3],
    ["CAISSE DE MALADIE", 1],
    ["CAISSE DE PENSION", 1],
    ["FICHE DE SALAIRE", 2],
    ["SALAIRE NET", 1],
  ]);

  /*
   * ITALIA
   *
   * Non ci affidiamo soltanto alle intestazioni dei totali:
   * nei cedolini scansionati sono spesso la parte peggiore
   * dell'OCR.
   *
   * Utilizziamo quindi anche termini tipici e ripetuti nelle
   * singole voci del cedolino.
   */
  const itaScore = scoreSignals(normalized, [
    ["CODICE FISCALE", 2],
    ["LAVORO ORDINARIO", 3],
    ["STRAORDINARIO", 2],
    ["FERIE GODUTE", 2],
    ["TRASFERTA ITALIA", 3],
    ["INPS", 2],
    ["IRPEF", 2],
    ["ADDIZIONALE REGIONALE", 2],
    ["ADDIZIONALE COMUNALE", 2],
    ["TFR", 1],
    ["NETTO BUSTA", 3],
    ["RETTO BUSTA", 2],
    ["IMPON CONTR SOC", 2],
    ["CONTRIBUTI SOCIALI", 2],
    ["PAGA BASE", 1],
    ["RETRIBUZIONE", 1],
    ["ELABORATO DA", 1],
  ]);

  /*
   * FRANCIA
   *
   * Manteniamo FRA separato da LUX. I termini troppo generici
   * come SALAIRE NET non sono sufficienti da soli.
   */
  const fraScore = scoreSignals(normalized, [
    ["BULLETIN DE PAIE", 4],
    ["URSSAF", 4],
    ["NET SOCIAL", 3],
    ["COTISATIONS ET CONTRIBUTIONS SOCIALES", 3],
    ["NET A PAYER", 2],
    ["SALAIRE BRUT", 1],
    ["CONGES PAYES", 1],
    ["PRELEVEMENT A LA SOURCE", 2],
  ]);

  const scores: Array<{
    country: PayrollImportCountry;
    score: number;
  }> = [
    { country: "ITA", score: itaScore },
    { country: "FRA", score: fraScore },
    { country: "LUX", score: luxScore },
  ];

  scores.sort((a, b) => b.score - a.score);

  const best = scores[0];
  const second = scores[1];

  /*
   * Richiediamo più di un indizio reale.
   * Evita, ad esempio, di classificare ITA un documento
   * soltanto perché contiene casualmente "INPS".
   */
  if (best.score < 4) {
    return null;
  }

  /*
   * In caso di punteggio identico non prendiamo decisioni
   * automatiche: il documento deve restare da verificare.
   */
  if (best.score === second.score) {
    return null;
  }

  return best.country;
}