import { renderToBuffer } from "@react-pdf/renderer";
import {
  CestneProhlaseniDocument,
  type CestneProhlaseniData,
} from "@/lib/pdf/cestne-prohlaseni-template";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let data: CestneProhlaseniData;
  try {
    data = (await request.json()) as CestneProhlaseniData;
  } catch {
    return new Response("Neplatný JSON", { status: 400 });
  }

  if (!data.nazevAkce) {
    return new Response("Chybí název akce", { status: 422 });
  }

  const buffer = await renderToBuffer(<CestneProhlaseniDocument data={data} />);

  const filename = `cestne-prohlaseni-${data.id}-${data.jmenoPrijemce.replace(/\s+/g, "-")}.pdf`;

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

export async function GET() {
  const demo: CestneProhlaseniData = {
    nazevAkce: "Kamenice 2026",
    id: "001",
    ucel: "Vlak na místě",
    castka: 162,
    jmenoPrijemce: "Tomáš Malejka",
    cisloCskPrijemce: "556 072",
    cisloUctuPrijemce: "124 872 8016",
    kodBanky: "3030",
    variabilniSymbol: "001 556072",
    poradatelAkce: "Tomáš Malejka",
    cisloCskPoradatele: "556 072",
  };

  const buffer = await renderToBuffer(<CestneProhlaseniDocument data={demo} />);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="cestne-prohlaseni-demo.pdf"',
    },
  });
}
