import type { ReactNode } from "react";

// Fluent UI removed — shadcn/ui + Tailwind CSS nepotřebuje provider wrapper.
export function Providers({ children }: { children: ReactNode }) {
    return <>{children}</>;
}
