import React from "react";
import path from "path";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

Font.register({
  family: "Roboto",
  fonts: [
    { src: path.join(process.cwd(), "public/fonts/Roboto-Regular.ttf"), fontWeight: "normal" },
    { src: path.join(process.cwd(), "public/fonts/Roboto-Regular.ttf"), fontWeight: "bold" },
  ],
});

// ──────────────────────────────────────────────
// Typy
// ──────────────────────────────────────────────

export type CestneProhlaseniData = {
  nazevAkce: string;
  id: string;
  ucel: string;
  castka: number;
  jmenoPrijemce: string;
  cisloCskPrijemce: string;
  cisloUctuPrijemce: string;
  kodBanky: string;
  variabilniSymbol: string;
  poradatelAkce: string;
  cisloCskPoradatele: string;
};

// ──────────────────────────────────────────────
// Styly
// ──────────────────────────────────────────────

const s = StyleSheet.create({
  page: {
    fontFamily: "Roboto",
    fontSize: 10,
    padding: 36,
    color: "#000",
  },

  // Vnější rámeček celého formuláře
  formBorder: {
    borderWidth: 1.5,
    borderColor: "#000",
    padding: 16,
  },

  title: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 14,
  },

  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },

  fieldBlock: {
    flex: 1,
    flexDirection: "column",
  },
  fieldBlockNarrow: {
    width: 80,
    flexDirection: "column",
  },
  fieldBlockWide: {
    flex: 2,
    flexDirection: "column",
  },
  fieldBlockMedium: {
    width: 110,
    flexDirection: "column",
  },

  fieldSingle: {
    flexDirection: "column",
    marginBottom: 10,
  },

  label: {
    fontSize: 9,
    marginBottom: 3,
    color: "#222",
  },

  inputBox: {
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 26,
    justifyContent: "center",
  },
  inputValue: {
    fontSize: 10,
  },

  inputBoxWithUnit: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 2,
    paddingHorizontal: 8,
    paddingVertical: 5,
    minHeight: 26,
  },
  inputValueFlex: {
    flex: 1,
    fontSize: 10,
  },
  unit: {
    fontSize: 10,
    marginLeft: 6,
    color: "#333",
  },

  accountSeparator: {
    fontSize: 14,
    alignSelf: "flex-end",
    paddingBottom: 5,
    paddingHorizontal: 4,
    color: "#333",
  },

  signatureBlock: {
    marginBottom: 10,
  },
  signatureBox: {
    borderWidth: 1,
    borderColor: "#555",
    borderRadius: 2,
    height: 60,
    justifyContent: "flex-end",
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  signatureLabel: {
    fontSize: 8,
    color: "#aaa",
  },
});

// ──────────────────────────────────────────────
// Komponenta
// ──────────────────────────────────────────────

export function CestneProhlaseniDocument({ data }: { data: CestneProhlaseniData }) {
  const fmt = (v: number) =>
    v.toLocaleString("cs-CZ", { minimumFractionDigits: 0 });

  return (
    <Document>
      <Page size="A4" style={s.page}>
        <View style={s.formBorder}>

          <Text style={s.title}>Čestné prohlášení nákladu akce</Text>

          {/* Název akce + ID */}
          <View style={s.row}>
            <View style={s.fieldBlock}>
              <Text style={s.label}>Název akce:</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.nazevAkce}</Text>
              </View>
            </View>
            <View style={s.fieldBlockNarrow}>
              <Text style={s.label}>ID:</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.id}</Text>
              </View>
            </View>
          </View>

          {/* Účel + Částka */}
          <View style={s.row}>
            <View style={s.fieldBlockWide}>
              <Text style={s.label}>Účel (například ubytování):</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.ucel}</Text>
              </View>
            </View>
            <View style={s.fieldBlockMedium}>
              <Text style={s.label}>Částka:</Text>
              <View style={s.inputBoxWithUnit}>
                <Text style={s.inputValueFlex}>{fmt(data.castka)}</Text>
                <Text style={s.unit}>Kč</Text>
              </View>
            </View>
          </View>

          {/* Jméno příjemce + číslo ČSK */}
          <View style={s.row}>
            <View style={s.fieldBlockWide}>
              <Text style={s.label}>Jméno Příjemce</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.jmenoPrijemce}</Text>
              </View>
            </View>
            <View style={s.fieldBlock}>
              <Text style={s.label}>číslo ČSK</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.cisloCskPrijemce}</Text>
              </View>
            </View>
          </View>

          {/* Číslo účtu + kód banky */}
          <View style={s.row}>
            <View style={s.fieldBlockWide}>
              <Text style={s.label}>Číslo účtu příjemce</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.cisloUctuPrijemce}</Text>
              </View>
            </View>
            <Text style={s.accountSeparator}>/</Text>
            <View style={s.fieldBlock}>
              <Text style={s.label}>kód banky</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.kodBanky}</Text>
              </View>
            </View>
          </View>

          {/* Variabilní symbol */}
          <View style={s.fieldSingle}>
            <Text style={s.label}>Variabilní symbol (ID akce + ID příjemce = číslo ČSK)</Text>
            <View style={s.inputBox}>
              <Text style={s.inputValue}>{data.variabilniSymbol}</Text>
            </View>
          </View>

          {/* Podpis příjemce */}
          <View style={s.signatureBlock}>
            <View style={s.signatureBox}>
              <Text style={s.signatureLabel}>Podpis</Text>
            </View>
          </View>

          {/* Pořadatel akce + číslo ČSK */}
          <View style={s.row}>
            <View style={s.fieldBlockWide}>
              <Text style={s.label}>Pořadatel akce</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.poradatelAkce}</Text>
              </View>
            </View>
            <View style={s.fieldBlock}>
              <Text style={s.label}>číslo ČSK</Text>
              <View style={s.inputBox}>
                <Text style={s.inputValue}>{data.cisloCskPoradatele}</Text>
              </View>
            </View>
          </View>

          {/* Podpis pořadatele */}
          <View style={s.signatureBlock}>
            <View style={s.signatureBox}>
              <Text style={s.signatureLabel}>Podpis</Text>
            </View>
          </View>

        </View>
      </Page>
    </Document>
  );
}
