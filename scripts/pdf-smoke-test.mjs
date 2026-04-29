import { spawn } from "node:child_process";

const ROOT = process.cwd();
const PORT = Number(process.env.PDF_SMOKE_PORT ?? 4010);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const ROUTES = [
  {
    name: "vyuctovani",
    endpoint: "/api/pdf/vyuctovani",
    postBody: {
      oddi: "Oddil \u0160\u00e1rka",
      cisloZalohy: "2026-001",
      zaMesic: "4/2026",
      veVysi: 12000,
      naklady: {
        "518/008": 3200,
        "518/009": 4100,
      },
      prijmy: {
        "602/62": 5000,
        "602/64": 1000,
      },
      vyuctoval: "Jan Novak",
      schvalil: "Marie Svobodova",
      datum: "29. 4. 2026",
    },
  },
  {
    name: "cestovni-prikaz",
    endpoint: "/api/pdf/cestovni-prikaz",
    postBody: {
      nazevAkce: "Kamenice 2026",
      id: "001",
      nakladyNaDopravu: 1620,
      jmenoPrijemce: "\u0160\u00e1rka \u010cern\u00e1",
      cisloCskPrijemce: "556072",
      cisloUctuPrijemce: "123456789",
      kodBanky: "3030",
      variabilniSymbol: "001556072",
      poradatelAkce: "Tomas Malejka",
      cisloCskPoradatele: "556072",
    },
  },
  {
    name: "cestne-prohlaseni",
    endpoint: "/api/pdf/cestne-prohlaseni",
    postBody: {
      nazevAkce: "Kamenice 2026",
      id: "001",
      ucel: "vlak na miste",
      castka: 162,
      jmenoPrijemce: "\u0160\u00e1rka \u010cern\u00e1",
      cisloCskPrijemce: "556072",
      cisloUctuPrijemce: "123456789",
      kodBanky: "3030",
      variabilniSymbol: "001556072",
      poradatelAkce: "Tomas Malejka",
      cisloCskPoradatele: "556072",
    },
  },
];

function ensure(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady() {
  const maxAttempts = 90;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(`${BASE_URL}/api/health`);
      if (response.ok) return;
    } catch {
      // server not ready yet
    }

    await delay(1000);
  }

  throw new Error("Next server did not become ready in time");
}

function startServer() {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

  const child = spawn(npmCommand, ["run", "start", "--", "--port", String(PORT)], {
    cwd: ROOT,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", () => {
    // no-op: keeping stream drained avoids backpressure.
  });
  child.stderr?.on("data", () => {
    // no-op: keeping stream drained avoids backpressure.
  });

  return child;
}

async function stopServer(child) {
  if (!child || child.killed) return;

  child.kill("SIGTERM");

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(5000).then(() => {
      child.kill("SIGKILL");
    }),
  ]);
}

async function assertPdfResponse(response, routeName, method) {
  ensure(response instanceof Response, `${routeName} ${method} did not return a Response`);
  ensure(response.status === 200, `${routeName} ${method} returned status ${response.status}`);

  const contentType = response.headers.get("content-type") ?? "";
  ensure(contentType.includes("application/pdf"), `${routeName} ${method} content-type is not PDF`);

  const payload = await response.arrayBuffer();
  ensure(payload.byteLength > 500, `${routeName} ${method} returned suspiciously small PDF payload`);

  if (method === "POST") {
    const disposition = response.headers.get("content-disposition") ?? "";
    ensure(disposition.includes("attachment"), `${routeName} POST missing attachment disposition`);
    ensure(disposition.includes("filename*=UTF-8''"), `${routeName} POST missing UTF-8 filename encoding`);
  }
}

async function main() {
  const server = startServer();

  server.on("exit", (code, signal) => {
    if (code !== 0 && signal !== "SIGTERM" && signal !== "SIGKILL") {
      console.error(`next start exited unexpectedly with code ${code}`);
    }
  });

  await waitForServerReady();

  let passed = 0;

  try {
    for (const route of ROUTES) {
      const getResponse = await fetch(`${BASE_URL}${route.endpoint}`);
      await assertPdfResponse(getResponse, route.name, "GET");

      const postResponse = await fetch(`${BASE_URL}${route.endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(route.postBody),
      });
      await assertPdfResponse(postResponse, route.name, "POST");

      passed += 1;
      console.log(`OK ${route.name}: GET and POST`);
    }

    console.log(`PDF smoke tests passed: ${passed}/${ROUTES.length}`);
  } finally {
    await stopServer(server);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`PDF smoke test failed: ${message}`);
  process.exit(1);
});
