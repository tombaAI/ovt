"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createExternalPerson, type PersonOption } from "@/lib/actions/people";

function personLabel(person: PersonOption): string {
  const name = person.nickname ? `${person.fullName} (${person.nickname})` : person.fullName;
  return person.kind === "external" ? `${name} · nečlen` : name;
}

function matchesPerson(person: PersonOption, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;

  return [
    person.fullName,
    person.firstName,
    person.lastName,
    person.nickname,
    person.cskNumber,
    person.email,
  ]
    .filter(Boolean)
    .some(value => value!.toLowerCase().includes(normalized));
}

export function PersonAutocomplete({
  label = "Komu proplatit",
  people,
  peopleLoaded,
  value,
  disabled,
  placeholder,
  onChange,
  onPersonCreated,
  className,
  accountMissingText = "Účet zatím není vyplněný. Do tabulky pro proplacení se propíše prázdný.",
}: {
  label?: string;
  people: PersonOption[];
  peopleLoaded: boolean;
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onChange: (person: PersonOption | null) => void;
  onPersonCreated: (person: PersonOption) => void;
  className?: string;
  accountMissingText?: string;
}) {
  const [text, setText] = useState("");
  const [focused, setFocused] = useState(false);
  const [addingExternal, setAddingExternal] = useState(false);
  const [externalName, setExternalName] = useState("");
  const [externalAccount, setExternalAccount] = useState("");
  const [externalBankCode, setExternalBankCode] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = people.find(person => String(person.id) === value) ?? null;
  const account = selected?.bankAccountNumber && selected?.bankCode
    ? `${selected.bankAccountNumber}/${selected.bankCode}`
    : null;

  useEffect(() => {
    setText(selected ? personLabel(selected) : "");
  }, [selected]);

  const suggestions = focused && peopleLoaded
    ? people.filter(person => matchesPerson(person, text)).slice(0, 8)
    : [];

  function selectPerson(person: PersonOption) {
    setText(personLabel(person));
    setFocused(false);
    onChange(person);
  }

  function clearPerson() {
    setText("");
    setFocused(false);
    onChange(null);
  }

  function handleBlur() {
    setTimeout(() => {
      setFocused(false);
      setText(selected ? personLabel(selected) : "");
    }, 150);
  }

  async function handleCreateExternal() {
    setCreating(true);
    setCreateError(null);
    try {
      const result = await createExternalPerson({
        fullName: externalName,
        bankAccountNumber: externalAccount,
        bankCode: externalBankCode,
      });
      if ("error" in result) {
        setCreateError(result.error);
        return;
      }
      onPersonCreated(result.person);
      selectPerson(result.person);
      setExternalName("");
      setExternalAccount("");
      setExternalBankCode("");
      setAddingExternal(false);
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className={["space-y-1.5", className].filter(Boolean).join(" ")}>
      <Label>{label}</Label>
      <div className="relative">
        <Input
          value={text}
          disabled={disabled || !peopleLoaded}
          placeholder={placeholder ?? (peopleLoaded ? "Začni psát jméno, přezdívku nebo ČSK…" : "Načítám osoby…")}
          autoComplete="off"
          onChange={event => {
            setText(event.target.value);
            if (event.target.value.trim() === "") onChange(null);
          }}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          onKeyDown={event => {
            if (event.key === "Enter" && suggestions.length > 0) {
              event.preventDefault();
              selectPerson(suggestions[0]!);
            }
            if (event.key === "Escape") handleBlur();
          }}
          className="pr-8"
        />
        {value && (
          <button
            type="button"
            onClick={clearPerson}
            disabled={disabled}
            className="absolute right-2 top-1/2 -translate-y-1/2 px-1 text-lg leading-none text-gray-400 hover:text-gray-600 disabled:opacity-40"
            title="Vymazat příjemce"
          >
            ×
          </button>
        )}
        {suggestions.length > 0 && (
          <div className="absolute z-20 top-full mt-1 max-h-56 w-full overflow-y-auto rounded-lg border bg-white shadow-md divide-y">
            {suggestions.map((person, index) => (
              <button
                key={person.id}
                type="button"
                className={[
                  "w-full px-3 py-2 text-left text-sm transition-colors",
                  index === 0 ? "bg-gray-50 font-medium" : "hover:bg-gray-50",
                ].join(" ")}
                onMouseDown={event => {
                  event.preventDefault();
                  selectPerson(person);
                }}
              >
                <span>{personLabel(person)}</span>
                {(person.cskNumber || person.email) && (
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    {person.cskNumber ? `ČSK ${person.cskNumber}` : person.email}
                  </span>
                )}
              </button>
            ))}
          </div>
        )}
        {focused && text.trim() !== "" && suggestions.length === 0 && peopleLoaded && (
          <div className="absolute z-20 top-full mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-400 shadow-sm">
            Žádný odpovídající člověk
          </div>
        )}
      </div>
      {selected && (
        <p className={`text-[11px] ${account ? "text-gray-400" : "text-amber-600"}`}>
          {account ? `Účet: ${account}` : accountMissingText}
        </p>
      )}
      <button
        type="button"
        onClick={() => { setAddingExternal(value => !value); setCreateError(null); }}
        className="text-xs text-blue-600 hover:underline"
      >
        {addingExternal ? "Zavřít přidání nečlena" : "Přidat příjemce mimo členy"}
      </button>
      {addingExternal && (
        <div className="space-y-2 rounded-lg border bg-white p-3">
          <Input value={externalName} onChange={event => setExternalName(event.target.value)} placeholder="Jméno a příjmení" />
          <div className="grid grid-cols-2 gap-2">
            <Input value={externalAccount} onChange={event => setExternalAccount(event.target.value)} placeholder="Číslo účtu" />
            <Input value={externalBankCode} onChange={event => setExternalBankCode(event.target.value)} placeholder="Kód banky" />
          </div>
          {createError && <p className="text-xs text-red-500">{createError}</p>}
          <Button type="button" size="sm" variant="outline" onClick={handleCreateExternal} disabled={creating}>
            {creating ? "Ukládám…" : "Uložit nečlena"}
          </Button>
        </div>
      )}
      <p className="text-xs text-gray-400">Enter potvrdí první nabídku</p>
    </div>
  );
}