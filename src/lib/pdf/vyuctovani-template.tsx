import React from "react";
import path from "path";
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
} from "@react-pdf/renderer";

const fontsDir = path.join(process.cwd(), "public/fonts");

const robotoTtf = path.join(fontsDir, "Roboto-Regular.ttf");

Font.register({
  family: "Roboto",
  fonts: [
    { src: robotoTtf, fontWeight: "normal" },
    { src: robotoTtf, fontWeight: "bold" },
  ],
});

// ──────────────────────────────────────────────
// Typy
// ──────────────────────────────────────────────

export type VyuctovaniNaklady = {
  "501/004"?: number; // Kanc. potřeby, ostatní materiál
  "501/006"?: number; // Spotřeba sportovního materiálu
  "511/002"?: number; // Oprava sportovních potřeb
  "518/001"?: number; // Nájem tělocvičen, bazénů
  "518/003"?: number; // Spoje
  "518/004"?: number; // Poštovné
  "518/008"?: number; // Startovné, registrace
  "518/009"?: number; // Soutěže, ubytování, doprava
  "518/010"?: number; // Služby - náklady na přípravu
  "518/011"?: number; // Služby - náklady na soustředění
  "518/012"?: number; // Služby - mezinárodní činnost
  "518/014"?: number; // Přestupy, hostování
  "549/004"?: number; // Odměny rozhodčím
};

export type VyuctovaniPrijmy = {
  "602/61"?: number; // Příjmy - příprava
  "602/62"?: number; // Příjmy - soutěže
  "602/63"?: number; // Příjmy - mezinárodní činnost
  "602/64"?: number; // Příjmy - soustředění, platby účastníků
  "602/65"?: number; // Příjmy - ostatní tělových. činnost
  "602/66"?: number; // Ostatní příjmy
  "602/67"?: number; // Přestupy, hostování
  "602/23"?: number; // Reklamy - plochy
  "602/24"?: number; // Reklamy - zajištění
  "682/63"?: number; // Dary, sponzoři
};

export type VyuctovaniData = {
  oddi: string;
  cisloZalohy?: string;
  zaMesic?: string;
  zaMesicLabel?: string;
  veVysi?: number;
  naklady: VyuctovaniNaklady;
  prijmy: VyuctovaniPrijmy;
  vyuctoval?: string;
  schvalil?: string;
  datum?: string;
};

// ──────────────────────────────────────────────
// Styly
// ──────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 8,
    paddingHorizontal: 28,
    paddingVertical: 24,
    color: "#000",
  },

  // Hlavička
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#000",
  },
  headerLabel: {
    fontFamily: "Roboto",
    fontWeight: "bold",
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 4,
    flex: 1,
  },
  headerValue: {
    flex: 2,
    borderLeftWidth: 1,
    borderColor: "#000",
    paddingHorizontal: 6,
    paddingVertical: 4,
    fontSize: 10,
  },

  // Záloha řádek
  zalohaRow: {
    flexDirection: "row",
    borderWidth: 1,
    borderColor: "#000",
    marginBottom: 10,
  },
  zalohaCell: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 6,
    paddingVertical: 4,
  },
  zalohaCellBorder: {
    borderLeftWidth: 1,
    borderColor: "#000",
  },
  zalohaLabel: {
    fontFamily: "Roboto",
    fontWeight: "bold",
    marginRight: 4,
  },

  // Tabulka
  table: {
    borderWidth: 1,
    borderColor: "#000",
    marginBottom: 10,
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#e8e8e8",
    borderBottomWidth: 1,
    borderColor: "#000",
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
    minHeight: 14,
  },
  tableRowLast: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#000",
    backgroundColor: "#f0f0f0",
    minHeight: 14,
  },
  colUcet: {
    width: 55,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRightWidth: 0.5,
    borderColor: "#ccc",
  },
  colNazev: {
    flex: 1,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRightWidth: 0.5,
    borderColor: "#ccc",
  },
  colCastka: {
    width: 70,
    paddingHorizontal: 4,
    paddingVertical: 2,
    textAlign: "right",
  },
  bold: {
    fontFamily: "Roboto",
    fontWeight: "bold",
  },

  // Shrnutí spodek
  shrnutiTable: {
    borderWidth: 1,
    borderColor: "#000",
    marginBottom: 10,
  },
  shrnutiRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
    minHeight: 16,
    alignItems: "center",
  },
  shrnutiRowLast: {
    flexDirection: "row",
    minHeight: 16,
    alignItems: "center",
  },
  shrnutiLabel: {
    fontFamily: "Roboto",
    fontWeight: "bold",
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  shrnutiValue: {
    width: 100,
    paddingHorizontal: 6,
    paddingVertical: 3,
    textAlign: "right",
    borderLeftWidth: 0.5,
    borderColor: "#ccc",
  },

  // Podpisy
  podpisyTable: {
    borderWidth: 1,
    borderColor: "#000",
  },
  podpisRow: {
    flexDirection: "row",
    borderBottomWidth: 0.5,
    borderColor: "#ccc",
    minHeight: 18,
    alignItems: "center",
  },
  podpisRowLast: {
    flexDirection: "row",
    minHeight: 18,
    alignItems: "center",
  },
  podpisLabel: {
    fontFamily: "Roboto",
    fontWeight: "bold",
    width: 120,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRightWidth: 0.5,
    borderColor: "#ccc",
  },
  podpisValue: {
    flex: 1,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
});

// ──────────────────────────────────────────────
// Pomocné funkce
// ──────────────────────────────────────────────

const fmt = (v?: number) =>
  v != null ? v.toLocaleString("cs-CZ", { minimumFractionDigits: 2 }) : "";

const sumObj = (obj: Record<string, number | undefined>) =>
  Object.values(obj).reduce<number>((acc, v) => acc + (v ?? 0), 0);

// ──────────────────────────────────────────────
// Řádky tabulek
// ──────────────────────────────────────────────

const NAKLADY_ROWS: [keyof VyuctovaniNaklady, string][] = [
  ["501/004", "Kanc. potřeby, ostatní materiál"],
  ["501/006", "Spotřeba sportovního materiálu"],
  ["511/002", "Oprava sportovních potřeb"],
  ["518/001", "Nájem tělocvičen, bazénů"],
  ["518/003", "Spoje"],
  ["518/004", "Poštovné"],
  ["518/008", "Startovné, registrace"],
  ["518/009", "Soutěže, ubytování, doprava"],
  ["518/010", "Služby - náklady na přípravu"],
  ["518/011", "Služby - náklady na soustředění"],
  ["518/012", "Služby - mezinárodní činnost"],
  ["518/014", "Přestupy, hostování"],
  ["549/004", "Odměny rozhodčím"],
];

const PRIJMY_ROWS: [keyof VyuctovaniPrijmy, string][] = [
  ["602/61", "Příjmy - příprava"],
  ["602/62", "Příjmy - soutěže"],
  ["602/63", "Příjmy - mezinárodní činnost"],
  ["602/64", "Příjmy - soustředění, platby účastníků"],
  ["602/65", "Příjmy - ostatní tělových. činnost"],
  ["602/66", "Ostatní příjmy"],
  ["602/67", "Přestupy, hostování"],
  ["602/23", "Reklamy - plochy"],
  ["602/24", "Reklamy - zajištění"],
  ["682/63", "Dary, sponzoři"],
];

// ──────────────────────────────────────────────
// Komponenta
// ──────────────────────────────────────────────

export function VyuctovaniDocument({ data }: { data: VyuctovaniData }) {
  const nakladyCelkem = sumObj(data.naklady);
  const prijmyCelkem = sumObj(data.prijmy);
  const vysledek = prijmyCelkem - nakladyCelkem;
  const zalohaCelkem = data.veVysi ?? 0;
  const vracenyPrebytek = vysledek > 0 ? vysledek : 0;
  const pozadovanyNedoplatek = vysledek < 0 ? Math.abs(vysledek) : 0;
  const zaMesicLabel = data.zaMesicLabel ?? "za měsíc";

  return (
    <Document>
      <Page size="A4" style={s.page}>

        {/* Hlavička */}
        <View style={s.headerRow}>
          <Text style={s.headerLabel}>Vyúčtování oddílu:</Text>
          <Text style={s.headerValue}>{data.oddi}</Text>
        </View>

        {/* Záloha / měsíc / výše */}
        <View style={s.zalohaRow}>
          <View style={s.zalohaCell}>
            <Text style={s.zalohaLabel}>číslo zálohy:</Text>
            <Text>{data.cisloZalohy ?? ""}</Text>
          </View>
          <View style={[s.zalohaCell, s.zalohaCellBorder]}>
            <Text style={s.zalohaLabel}>{zaMesicLabel}:</Text>
            <Text>{data.zaMesic ?? ""}</Text>
          </View>
          <View style={[s.zalohaCell, s.zalohaCellBorder]}>
            <Text style={s.zalohaLabel}>ve výši:</Text>
            <Text>{fmt(data.veVysi)}</Text>
          </View>
        </View>

        {/* Náklady */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.colUcet, s.bold]}>Č.účtu</Text>
            <Text style={[s.colNazev, s.bold]}>Náklady</Text>
            <Text style={[s.colCastka, s.bold]}>Celkem</Text>
          </View>
          {NAKLADY_ROWS.map(([key, label]) => (
            <View key={key} style={s.tableRow}>
              <Text style={s.colUcet}>{key}</Text>
              <Text style={s.colNazev}>{label}</Text>
              <Text style={s.colCastka}>{fmt(data.naklady[key])}</Text>
            </View>
          ))}
          <View style={s.tableRowLast}>
            <Text style={[s.colUcet, s.bold]}></Text>
            <Text style={[s.colNazev, s.bold]}>Náklady celkem</Text>
            <Text style={[s.colCastka, s.bold]}>{fmt(nakladyCelkem)}</Text>
          </View>
        </View>

        {/* Příjmy */}
        <View style={s.table}>
          <View style={s.tableHeader}>
            <Text style={[s.colUcet, s.bold]}>Č.účtu</Text>
            <Text style={[s.colNazev, s.bold]}>Příjmy</Text>
            <Text style={[s.colCastka, s.bold]}>Celkem</Text>
          </View>
          {PRIJMY_ROWS.map(([key, label]) => (
            <View key={key} style={s.tableRow}>
              <Text style={s.colUcet}>{key}</Text>
              <Text style={s.colNazev}>{label}</Text>
              <Text style={s.colCastka}>{fmt(data.prijmy[key])}</Text>
            </View>
          ))}
          <View style={s.tableRowLast}>
            <Text style={[s.colUcet, s.bold]}></Text>
            <Text style={[s.colNazev, s.bold]}>Příjmy celkem</Text>
            <Text style={[s.colCastka, s.bold]}>{fmt(prijmyCelkem)}</Text>
          </View>
          <View style={s.tableRowLast}>
            <Text style={[s.colUcet, s.bold]}></Text>
            <Text style={[s.colNazev, s.bold]}>Výsledek celkem</Text>
            <Text style={[s.colCastka, s.bold]}>{fmt(vysledek)}</Text>
          </View>
        </View>

        {/* Shrnutí zálohy */}
        <View style={s.shrnutiTable}>
          <View style={s.shrnutiRow}>
            <Text style={s.shrnutiLabel}>Záloha:</Text>
            <Text style={s.shrnutiValue}>{fmt(zalohaCelkem)}</Text>
          </View>
          <View style={s.shrnutiRow}>
            <Text style={s.shrnutiLabel}>Vrácený přebytek:</Text>
            <Text style={s.shrnutiValue}>
              {vracenyPrebytek > 0 ? fmt(vracenyPrebytek) : ""}
            </Text>
          </View>
          <View style={s.shrnutiRowLast}>
            <Text style={s.shrnutiLabel}>Požadovaný nedoplatek:</Text>
            <Text style={s.shrnutiValue}>
              {pozadovanyNedoplatek > 0 ? fmt(pozadovanyNedoplatek) : ""}
            </Text>
          </View>
        </View>

        {/* Podpisy */}
        <View style={s.podpisyTable}>
          <View style={s.podpisRow}>
            <Text style={s.podpisLabel}>Vyúčtoval:</Text>
            <Text style={s.podpisValue}>{data.vyuctoval ?? ""}</Text>
          </View>
          <View style={s.podpisRow}>
            <Text style={s.podpisLabel}>Schválil:</Text>
            <Text style={s.podpisValue}>{data.schvalil ?? ""}</Text>
          </View>
          <View style={s.podpisRowLast}>
            <Text style={s.podpisLabel}>V Praze dne:</Text>
            <Text style={s.podpisValue}>{data.datum ?? ""}</Text>
          </View>
        </View>

      </Page>
    </Document>
  );
}
