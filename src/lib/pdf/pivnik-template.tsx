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

const styles = StyleSheet.create({
    page: {
        fontFamily: "Roboto",
        fontSize: 10,
        paddingTop: 28,
        paddingBottom: 28,
        paddingHorizontal: 32,
        color: "#111827",
    },
    header: {
        marginBottom: 14,
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
        borderWidth: 1,
        borderColor: "#374151",
    },
    tableHeader: {
        flexDirection: "row",
        backgroundColor: "#1f2937",
        paddingVertical: 5,
        paddingHorizontal: 6,
    },
    // Oddělovač přihlášky — silná čára
    groupSeparator: {
        borderTopWidth: 1.5,
        borderTopColor: "#374151",
    },
    // Řádek účastníka — tenká čára
    participantRow: {
        flexDirection: "row",
        borderTopWidth: 0.5,
        borderTopColor: "#d1d5db",
        minHeight: 20,
        alignItems: "center",
        paddingHorizontal: 6,
    },
    participantRowFirst: {
        // první řádek přihlášky — bez horní čáry (má ji groupSeparator)
        borderTopWidth: 0,
    },

    colName: { width: "22%", paddingRight: 4 },
    colTally: { flex: 1, paddingHorizontal: 4, borderLeftWidth: 0.5, borderLeftColor: "#9ca3af" },
    colSmall1: { width: "9%", textAlign: "center", borderLeftWidth: 0.5, borderLeftColor: "#9ca3af" },
    colSmall2: { width: "9%", textAlign: "center", borderLeftWidth: 0.5, borderLeftColor: "#9ca3af" },
    colTotal: { width: "14%", textAlign: "center", borderLeftWidth: 1, borderLeftColor: "#374151" },

    headerText: { fontWeight: "bold", fontSize: 8, color: "#ffffff" },
    cell: { fontSize: 9.5 },
    cellMuted: { fontSize: 8.5, color: "#6b7280" },
});

export type PivnikParticipant = {
    fullName: string;
};

export type PivnikRegistration = {
    registrationId: number;
    participants: PivnikParticipant[];
};

export type PivnikData = {
    eventName: string;
    generatedAt: string;
    registrations: PivnikRegistration[];
    totalParticipants: number;
};

export function PivnikDocument({ data }: { data: PivnikData }) {
    return (
        <Document>
            <Page size="A4" orientation="landscape" style={styles.page}>
                <View style={styles.header}>
                    <Text style={styles.title}>Pivník — {data.eventName}</Text>
                    <Text style={styles.subtitle}>
                        Vygenerováno {data.generatedAt} · {data.totalParticipants} účastníků · {data.registrations.length} přihlášek
                    </Text>
                </View>

                <View style={styles.table}>
                    {/* Záhlaví */}
                    <View style={styles.tableHeader}>
                        <Text style={[styles.colName, styles.headerText]}>Jméno</Text>
                        <Text style={[styles.colTally, styles.headerText]}>Čárky</Text>
                        <Text style={[styles.colSmall1, styles.headerText]}>Ks</Text>
                        <Text style={[styles.colSmall2, styles.headerText]}>Pozn.</Text>
                        <Text style={[styles.colTotal, styles.headerText]}>Součet / Částka</Text>
                    </View>

                    {data.registrations.map((reg, gi) => (
                        <View key={reg.registrationId}>
                            {reg.participants.map((p, pi) => (
                                <View
                                    key={pi}
                                    style={[
                                        styles.participantRow,
                                        pi === 0
                                            ? gi === 0 ? styles.participantRowFirst : styles.groupSeparator
                                            : {},
                                    ]}
                                >
                                    <Text style={[styles.colName, styles.cell]}>{p.fullName}</Text>
                                    <Text style={[styles.colTally, styles.cell]}> </Text>
                                    <Text style={[styles.colSmall1, styles.cell]}> </Text>
                                    <Text style={[styles.colSmall2, styles.cell]}> </Text>
                                    <Text style={[styles.colTotal, styles.cell]}> </Text>
                                </View>
                            ))}
                        </View>
                    ))}
                </View>
            </Page>
        </Document>
    );
}
