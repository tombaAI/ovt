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
Font.register({
    family: "Roboto",
    fonts: [
        { src: path.join(fontsDir, "Roboto-Regular.ttf"), fontWeight: "normal" },
        { src: path.join(fontsDir, "Roboto-Bold.ttf"), fontWeight: "bold" },
    ],
});

const PAYMENT_STATUS_LABELS: Record<string, string> = {
    pending:   "čeká",
    matched:   "spárováno",
    paid:      "zaplaceno",
    cancelled: "zrušeno",
};

const styles = StyleSheet.create({
    page: {
        fontFamily: "Roboto",
        fontSize: 10,
        paddingTop: 32,
        paddingBottom: 32,
        paddingHorizontal: 36,
        color: "#111827",
    },
    header: {
        marginBottom: 16,
    },
    title: {
        fontSize: 14,
        fontWeight: "bold",
        marginBottom: 3,
    },
    subtitle: {
        fontSize: 9,
        color: "#6b7280",
    },
    table: {
        width: "100%",
    },
    tableHeader: {
        flexDirection: "row",
        borderBottomWidth: 1.5,
        borderBottomColor: "#374151",
        paddingBottom: 4,
        marginBottom: 2,
    },
    tableRow: {
        flexDirection: "row",
        borderBottomWidth: 0.5,
        borderBottomColor: "#e5e7eb",
        paddingVertical: 4,
    },
    colNo: { width: "7%", fontSize: 9, color: "#9ca3af" },
    colLastName: { width: "30%" },
    colFirstName: { width: "30%" },
    colCheck: { width: "10%", textAlign: "center" },
    colStatus: { width: "23%", textAlign: "right" },
    headerCell: { fontWeight: "bold", fontSize: 9, color: "#374151" },
    cell: { fontSize: 10 },
});

export type UcastnikRow = {
    lastName: string;
    firstName: string;
    paymentStatus: string | null;
};

export type UcastniciData = {
    eventName: string;
    generatedAt: string;
    rows: UcastnikRow[];
};

export function UcastniciDocument({ data }: { data: UcastniciData }) {
    return (
        <Document>
            <Page size="A4" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.title}>Seznam účastníků — {data.eventName}</Text>
                    <Text style={styles.subtitle}>Vygenerováno {data.generatedAt} · celkem {data.rows.length} účastníků</Text>
                </View>

                <View style={styles.table}>
                    <View style={styles.tableHeader}>
                        <Text style={[styles.colNo, styles.headerCell]}>#</Text>
                        <Text style={[styles.colLastName, styles.headerCell]}>Příjmení</Text>
                        <Text style={[styles.colFirstName, styles.headerCell]}>Jméno</Text>
                        <Text style={[styles.colCheck, styles.headerCell]}></Text>
                        <Text style={[styles.colStatus, styles.headerCell]}>Stav platby</Text>
                    </View>

                    {data.rows.map((row, i) => (
                        <View key={i} style={styles.tableRow}>
                            <Text style={[styles.colNo, styles.cell]}>{i + 1}</Text>
                            <Text style={[styles.colLastName, styles.cell]}>{row.lastName}</Text>
                            <Text style={[styles.colFirstName, styles.cell]}>{row.firstName}</Text>
                            <Text style={[styles.colCheck, styles.cell]}>☐</Text>
                            <Text style={[styles.colStatus, styles.cell]}>
                                {PAYMENT_STATUS_LABELS[row.paymentStatus ?? ""] ?? "—"}
                            </Text>
                        </View>
                    ))}
                </View>
            </Page>
        </Document>
    );
}
