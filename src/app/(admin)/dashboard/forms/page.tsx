"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HonorDeclarationForm } from "./honor-declaration-form";
import { SettlementForm } from "./settlement-form";
import { TravelOrderForm } from "./travel-order-form";

export default function FormsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Vyúčtování a příkazy</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Vyplň formulář a vygeneruj PDF podle schválené šablony.
        </p>
      </div>

      <Tabs defaultValue="settlement" className="space-y-4">
        <TabsList variant="line" className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="settlement">Vyúčtování oddílu</TabsTrigger>
          <TabsTrigger value="travel-order">Cestovní příkaz</TabsTrigger>
          <TabsTrigger value="honor-declaration">Čestné prohlášení</TabsTrigger>
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
