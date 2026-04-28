import { renderToBuffer } from "@react-pdf/renderer";
import { buildPdfAttachmentDisposition } from "@/lib/content-disposition";
import {
  VyuctovaniDocument,
  type VyuctovaniData,
} from "@/lib/pdf/vyuctovani-template";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let data: VyuctovaniData;
  try {
    data = (await request.json()) as VyuctovaniData;
  } catch {
    return new Response("Neplatný JSON", { status: 400 });
  }

  if (!data.oddi) {
    return new Response("Chybí název oddílu", { status: 422 });
  }

  const buffer = await renderToBuffer(<VyuctovaniDocument data={data} />);
  const disposition = buildPdfAttachmentDisposition("vyuctovani", data.oddi);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
    },
  });
}

// GET vrátí ukázkové PDF s demo daty – pro rychlé testování v prohlížeči
export async function GET() {
  const demo: VyuctovaniData = {
    oddi: "OVT Bohemians",
    cisloZalohy: "2025-001",
    zaMesic: "3/2025",
    veVysi: 15000,
    naklady: {
      "518/008": 3200,
      "518/009": 8750,
      "518/001": 1200,
    },
    prijmy: {
      "602/62": 5000,
      "602/64": 4500,
    },
    vyuctoval: "Jan Novák",
    schvalil: "Marie Svobodová",
    datum: new Date().toLocaleDateString("cs-CZ"),
  };

  const buffer = await renderToBuffer(<VyuctovaniDocument data={demo} />);

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'inline; filename="vyuctovani-demo.pdf"',
    },
  });
}
