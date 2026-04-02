import type { Metadata } from "next";
import type { ReactNode } from "react";

import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
    title: "OVT sprava",
    description: "Prvni technicke overeni aplikace, databaze a e-mailoveho setupu pro OVT."
};

type RootLayoutProps = Readonly<{
    children: ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
    return (
        <html lang="cs">
            <body>
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
