import React from "react";
import path from "path";
import { Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";

// ──────────────────────────────────────────────
// Font (sdílená cesta s vyuctovani-template)
// ──────────────────────────────────────────────

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

export type CestovniPrikazData = {
  nazevAkce: string;
  id: string;
  nakladyNaDopravu: number;
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
    paddingHorizontal: 36,
    paddingVertical: 32,
    color: "#000",
  },

  // Vnější rámeček celého formuláře
  formBorder: {
    borderWidth: 1.5,
    borderColor: "#000",
    padding: 16,
  },

  // Nadpis
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 18,
  },

  // Řádek se dvěma poli vedle sebe
  row: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 12,
  },

  // Blok jednoho pole (label + box)
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

  // Jednořádkové pole
  fieldSingle: {
    flexDirection: "column",
    marginBottom: 12,
  },

  label: {
    fontSize: 9,
    marginBottom: 3,
    color: "#222",
  },

  // Vstupní box
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

  // Box s jednotkou (Kč) na konci
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

  // Oddělovač účtu číslem " / "
  accountSeparator: {
    fontSize: 14,
    alignSelf: "flex-end",
    paddingBottom: 5,
    paddingHorizontal: 4,
    color: "#333",
  },

  // Podpisové pole
  signatureBlock: {
    marginBottom: 12,
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
// Pomocné komponenty
// ──────────────────────────────────────────────

function Field({ label, value }: { label: string; value?: string }) {
  return (
    <View style={s.fieldSingle}>
      <Text style={s.label}>{label}</Text>
      <View style={s.inputBox}>
        <Text style={s.inputValue}>{value ?? ""}</Text>
      </View>
    </View>
  );
}

function SignatureBox() {
  return (
    <View style={s.signatureBox}>
      <Text style={s.signatureLabel}>Podpis</Text>
    </View>
  );
}

// ──────────────────────────────────────────────
// Komponenta dokumentu
// ──────────────────────────────────────────────

export function CestovniPrikazDocument({ data }: { data: CestovniPrikazData }) {
  const fmt = (v: number) =>
    v.toLocaleString("cs-CZ", { minimumFractionDigits: 0 });

  return (
    <Document>
      <Page size="A4" style={s.page}>

        <View style={s.formBorder}>

        <Text style={s.title}>Cestovní příkaz</Text>

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

        {/* Náklady na dopravu */}
        <View style={s.fieldSingle}>
          <Text style={s.label}>Náklady na dopravu akce</Text>
          <View style={s.inputBoxWithUnit}>
            <Text style={s.inputValueFlex}>{fmt(data.nakladyNaDopravu)}</Text>
            <Text style={s.unit}>Kč</Text>
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
        <Field
          label="Variabilní symbol (ID akce + ID příjemce = číslo ČSK)"
          value={data.variabilniSymbol}
        />

        {/* Podpis příjemce */}
        <View style={s.signatureBlock}>
          <SignatureBox />
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
          <SignatureBox />
        </View>

        </View>

      </Page>
    </Document>
  );
}
