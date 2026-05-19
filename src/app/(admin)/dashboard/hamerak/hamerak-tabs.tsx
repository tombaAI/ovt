"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { HamerakClient } from "./hamerak-client";
import { HamerakPredikce } from "./hamerak-predikce-client";

export function HamerakTabs() {
    return (
        <Tabs defaultValue="kalkulator" className="flex flex-col min-h-0">
            <div className="border-b px-4 md:px-6 pt-4">
                <TabsList className="h-9">
                    <TabsTrigger value="kalkulator" className="text-sm">Kalkulačka</TabsTrigger>
                    <TabsTrigger value="predikce" className="text-sm">Predikce počtů</TabsTrigger>
                </TabsList>
            </div>
            <TabsContent value="kalkulator" className="mt-0 flex-1">
                <HamerakClient />
            </TabsContent>
            <TabsContent value="predikce" className="mt-0 flex-1">
                <HamerakPredikce />
            </TabsContent>
        </Tabs>
    );
}
