"use client";
import { useState } from "react";
import { VyuctovaniForm } from "./vyuctovani-form";
import { CestovniPrikazForm } from "./cestovni-prikaz-form";

export default function VyuctovaniPage() {
    const [tab, setTab] = useState<"vyuctovani" | "cestak">("vyuctovani");
    return (
        <div className="max-w-2xl mx-auto">
            <h1 className="text-2xl font-bold mb-6">Vyúčtování a cestovní příkaz</h1>
            <div className="flex gap-2 mb-6">
                <button
                    className={`px-4 py-2 rounded ${tab === "vyuctovani" ? "bg-[#82b965] text-white" : "bg-gray-100"}`}
                    onClick={() => setTab("vyuctovani")}
                >
                    Vyúčtování oddílu
                </button>
                <button
                    className={`px-4 py-2 rounded ${tab === "cestak" ? "bg-[#82b965] text-white" : "bg-gray-100"}`}
                    onClick={() => setTab("cestak")}
                >
                    Cestovní příkaz
                </button>
            </div>
            {tab === "vyuctovani" ? <VyuctovaniForm /> : <CestovniPrikazForm />}
        </div>
    );
}
