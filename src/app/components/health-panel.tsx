"use client";

import {
    Badge,
    Body1,
    Card,
    CardHeader,
    Spinner,
    Subtitle2,
    Title3
} from "@fluentui/react-components";
import { useEffect, useState } from "react";

type EndpointKey = "app" | "db" | "email";
type CardState = "loading" | "ready" | "missing" | "error";

type StatusItem = {
    detail: string;
    endpoint: string;
    state: CardState;
};

type HealthPayload = {
    configured?: boolean;
    detail?: string;
    ok?: boolean;
};

const endpointConfig: Array<{ endpoint: string; key: EndpointKey; title: string }> = [
    {
        key: "app",
        title: "Aplikace",
        endpoint: "/api/health"
    },
    {
        key: "db",
        title: "Databáze",
        endpoint: "/api/health/db"
    },
    {
        key: "email",
        title: "E-mail",
        endpoint: "/api/health/email"
    }
];

const initialState: Record<EndpointKey, StatusItem> = {
    app: {
        detail: "Zjišťuji runtime stav aplikace.",
        endpoint: "/api/health",
        state: "loading"
    },
    db: {
        detail: "Čekám na odpověď databázového health checku.",
        endpoint: "/api/health/db",
        state: "loading"
    },
    email: {
        detail: "Kontroluji připravenost e-mailové konfigurace.",
        endpoint: "/api/health/email",
        state: "loading"
    }
};

function getBadgeAppearance(state: CardState): "filled" | "outline" | "tint" {
    if (state === "ready") {
        return "filled";
    }

    if (state === "loading") {
        return "outline";
    }

    return "tint";
}

function getBadgeLabel(state: CardState): string {
    switch (state) {
        case "ready":
            return "Pripraveno";
        case "missing":
            return "Chybi konfigurace";
        case "error":
            return "Vyžaduje kontrolu";
        default:
            return "Kontroluji";
    }
}

export function HealthPanel() {
    const [status, setStatus] = useState<Record<EndpointKey, StatusItem>>(initialState);

    useEffect(() => {
        let active = true;

        async function loadStatus() {
            const results = await Promise.all(
                endpointConfig.map(async ({ endpoint, key }) => {
                    try {
                        const response = await fetch(endpoint, {
                            cache: "no-store"
                        });

                        const payload = (await response.json()) as HealthPayload;

                        const state: CardState = payload.ok
                            ? "ready"
                            : payload.configured === false
                                ? "missing"
                                : "error";

                        return [
                            key,
                            {
                                detail: payload.detail ?? "Endpoint nevrátil detail.",
                                endpoint,
                                state
                            }
                        ] as const;
                    } catch {
                        return [
                            key,
                            {
                                detail: "Nepodařilo se načíst JSON odpověď health checku.",
                                endpoint,
                                state: "error"
                            }
                        ] as const;
                    }
                })
            );

            if (!active) {
                return;
            }

            setStatus(Object.fromEntries(results) as Record<EndpointKey, StatusItem>);
        }

        void loadStatus();

        return () => {
            active = false;
        };
    }, []);

    return (
        <section className="panelSection" aria-labelledby="health-title">
            <h2 className="sectionTitle" id="health-title">
                Runtime ověření
            </h2>
            <p className="sectionLead">
                Tohle je první kontrolní vrstva pro technické prověření. Po nasazení na Vercel stačí otevřít tuto stránku a hned vidíš, jestli žije web, databáze a jestli je databázová migrace opravdu nahraná. E-mail je pro první deploy volitelný.
            </p>
            <div className="healthGrid">
                {endpointConfig.map(({ key, title }) => {
                    const item = status[key];

                    return (
                        <Card className="panel" key={key}>
                            <CardHeader
                                header={
                                    <Title3 as="h3" block>
                                        {title}
                                    </Title3>
                                }
                                action={
                                    <Badge appearance={getBadgeAppearance(item.state)}>{getBadgeLabel(item.state)}</Badge>
                                }
                            />
                            <Subtitle2 block className="muted">
                                {item.state === "loading" ? <Spinner size="tiny" labelPosition="after" /> : null}
                            </Subtitle2>
                            <Body1>{item.detail}</Body1>
                            <Body1 className="muted">
                                JSON detail: <a href={item.endpoint}>{item.endpoint}</a>
                            </Body1>
                        </Card>
                    );
                })}
            </div>
        </section>
    );
}
