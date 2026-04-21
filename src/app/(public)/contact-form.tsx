"use client";

import { useState } from "react";
import { sendContactEmail } from "@/lib/actions/contact";

export function ContactForm() {
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [status, setStatus] = useState<"idle" | "sending" | "ok" | "error">("idle");
    const [errorMsg, setErrorMsg] = useState("");

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setStatus("sending");
        setErrorMsg("");
        const result = await sendContactEmail({ name, email, message });
        if (result.ok) {
            setStatus("ok");
        } else {
            setStatus("error");
            setErrorMsg(result.error ?? "Něco se pokazilo, zkuste to znovu.");
        }
    }

    if (status === "ok") {
        return (
            <div className="bg-white rounded-xl p-8 border border-gray-100 shadow-sm text-center">
                <div className="text-4xl mb-4">✅</div>
                <p className="font-semibold text-lg mb-1" style={{ color: "#26272b" }}>Zpráva odeslána!</p>
                <p className="text-gray-600 text-sm">Ozveme se ti co nejdřív na zadaný e-mail.</p>
            </div>
        );
    }

    const inputClass = "w-full rounded-lg border border-gray-200 px-4 py-2.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:border-transparent bg-white";
    const focusStyle = { "--tw-ring-color": "#327600" } as React.CSSProperties;

    return (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl p-8 border border-gray-100 shadow-sm space-y-4 text-left">
            <div className="grid sm:grid-cols-2 gap-4">
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Jméno</label>
                    <input
                        type="text"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="Jan Novák"
                        className={inputClass}
                        style={focusStyle}
                    />
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                    <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="jan@example.cz"
                        className={inputClass}
                        style={focusStyle}
                    />
                </div>
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Zpráva</label>
                <textarea
                    required
                    rows={4}
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    placeholder="Napiš nám pár slov o sobě a co tě zajímá…"
                    className={`${inputClass} resize-none`}
                    style={focusStyle}
                />
            </div>
            {status === "error" && (
                <p className="text-sm text-red-600">{errorMsg}</p>
            )}
            <div className="flex items-center gap-4">
                <button
                    type="submit"
                    disabled={status === "sending"}
                    className="px-6 py-2.5 rounded-lg font-semibold text-white text-sm transition-opacity disabled:opacity-60"
                    style={{ backgroundColor: "#327600" }}
                >
                    {status === "sending" ? "Odesílám…" : "Odeslat"}
                </button>
                <span className="text-xs text-gray-400">
                    nebo napiš předsedovi:{" "}
                    <a href="mailto:tomas.matejka@bohemianstj.cz" className="underline" style={{ color: "#327600" }}>
                        tomas.matejka@bohemianstj.cz
                    </a>
                </span>
            </div>
        </form>
    );
}
