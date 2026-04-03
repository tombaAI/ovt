import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SpeedInsights } from "@vercel/speed-insights/next";

import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata: Metadata = {
    title: "OVT Bohemians — Správa",
    description: "Interní správa klubu OVT Bohemians."
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang="cs" className={cn("font-sans", geist.variable)}>
            <body className="min-h-screen bg-gray-50 antialiased">
                {children}
                <SpeedInsights />
            </body>
        </html>
    );
}
