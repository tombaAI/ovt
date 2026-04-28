import { renderToBuffer } from "@react-pdf/renderer";
import {
  CestovniPrikazDocument,
  type CestovniPrikazData,
} from "@/lib/pdf/cestovni-prikaz-template";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let data: CestovniPrikazData;
  try {
    data = (await request.json()) as CestovniPrikazData;
  } catch {
    return new Response("Neplatný JSON", { status: 400 });
  }

  if (!data.nazevAkce) {
    return new Response("Chybí název akce", { status: 422 });
  }

  const buffer = await renderToBuffer(<CestovniPrikazDocument data={data} />);

  const filename = `cestovni-prikaz-${data.id}-${data.jmenoPrijemce.replace(/\s+/g, "-")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

// GET — demo pro testování v prohlížeči
export async function GET() {
  const demo: CestovniPrikazData = {
    nazevAkce: "Kamenice 2026",
    id: "001",
    nakladyNaDopravu: 1000,
    jmenoPrijemce: "Tomáš Malejka",
    cisloCskPrijemce: "556 072",
    cisloUctuPrijemce: "124 872 8016",
    kodBanky: "3030",
    variabilniSymbol: "001 556072",
    poradatelAkce: "Tomáš Malejka",
    cisloCskPoradatele: "556 072",
  };

  const buffer = await renderToBuffer(<CestovniPrikazDocument data={demo} />);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="cestovni-prikaz-demo.pdf"',
    },
  });
}
