"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileCheck2, FileSpreadsheet, ReceiptText } from "lucide-react";
import { HonorDeclarationForm } from "./honor-declaration-form";
import { SettlementForm } from "./settlement-form";
import { TravelOrderForm } from "./travel-order-form";

export default function FormsPage() {
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Card className="border-none bg-gradient-to-r from-emerald-50 via-white to-lime-50 py-0 ring-1 ring-emerald-100">
        <CardHeader className="gap-2 py-6">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="bg-emerald-100 text-emerald-800">
              PDF agenda
            </Badge>
            <Badge variant="outline">3 formuláře</Badge>
          </div>
          <CardTitle className="text-2xl font-semibold">Vyúčtování a příkazy</CardTitle>
          <CardDescription className="max-w-2xl text-sm">
            Vyber typ dokumentu, vyplň údaje a stáhni PDF dle schválené šablony. Formuláře mají
            průběžné souhrny pro rychlou kontrolu před exportem.
          </CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="settlement" className="space-y-4">
        <TabsList
          variant="line"
          className="w-full justify-start overflow-x-auto rounded-xl border bg-card px-2 py-2"
        >
          <TabsTrigger value="settlement" className="gap-2 px-3">
            <FileSpreadsheet className="size-4" />
            Vyúčtování oddílu
          </TabsTrigger>
          <TabsTrigger value="travel-order" className="gap-2 px-3">
            <ReceiptText className="size-4" />
            Cestovní příkaz
          </TabsTrigger>
          <TabsTrigger value="honor-declaration" className="gap-2 px-3">
            <FileCheck2 className="size-4" />
            Čestné prohlášení
          </TabsTrigger>
        </TabsList>

        <TabsContent value="settlement">
          <SettlementForm />
        </TabsContent>

        <TabsContent value="travel-order">
          <TravelOrderForm />
        </TabsContent>

        <TabsContent value="honor-declaration">
          <HonorDeclarationForm />
        </TabsContent>
      </Tabs>
    </div>
  );
}
