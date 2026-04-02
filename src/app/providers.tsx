"use client";

import { FluentProvider, webLightTheme } from "@fluentui/react-components";
import type { ReactNode } from "react";

type ProvidersProps = {
  children: ReactNode;
};

export function Providers({ children }: ProvidersProps) {
  return <FluentProvider theme={webLightTheme}>{children}</FluentProvider>;
}
