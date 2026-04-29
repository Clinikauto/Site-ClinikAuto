const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const ROOT_DIR = process.cwd();
const SERVER_ENTRY = path.join(ROOT_DIR, "backend", "server.js");
const BASE_URL = process.env.LOCAL_BASE_URL || "http://127.0.0.1:3000";
const TEST_DATE = process.env.SMOKE_TEST_DATE || new Date().toISOString().slice(0, 10);
const STARTUP_TIMEOUT_MS = 30000;
const POLL_INTERVAL_MS = 800;
const IS_CI_MODE = process.argv.includes("--ci");

let shuttingDown = false;
let serverProcess = null;

function logStep(message) {
  console.log(`\n[ClinikAuto Runner] ${message}`);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runNodeScript(relativePath, label) {
  return new Promise((resolve, reject) => {
    const scriptPath = path.join(ROOT_DIR, relativePath);
    logStep(`Execution: ${label}`);

    const child = spawn("node", [scriptPath], {
      cwd: ROOT_DIR,
      stdio: "inherit"
    });

    child.on("error", (error) => {
      reject(new Error(`Impossible d'executer ${label}: ${error.message}`));
    });

    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} a echoue (code ${code})`));
    });
  });
}

function httpGetJson(pathname) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const req = http.get(url, (res) => {
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        resolve({
          statusCode: res.statusCode || 0,
          body
        });
      });
    });

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("Timeout HTTP"));
    });
  });
}

function httpRequest(pathname, method = "GET", payload = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(pathname, BASE_URL);
    const body = payload === null ? "" : JSON.stringify(payload);

    const req = http.request(
      {
        protocol: url.protocol,
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: {
          ...(body
            ? {
                "Content-Type": "application/json",
                "Content-Length": Buffer.byteLength(body)
              }
            : {}),
          ...headers
        }
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          resolve({
            statusCode: res.statusCode || 0,
            body: responseBody
          });
        });
      }
    );

    req.on("error", reject);
    req.setTimeout(5000, () => {
      req.destroy(new Error("Timeout HTTP"));
    });

    if (body) {
      req.write(body);
    }
    req.end();
  });
}

function parseJsonOrThrow(body, endpointLabel) {
  try {
    return JSON.parse(body);
  } catch (_error) {
    throw new Error(`La reponse de ${endpointLabel} n'est pas un JSON valide`);
  }
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < STARTUP_TIMEOUT_MS) {
    try {
      const response = await httpGetJson("/");
      if (response.statusCode >= 200 && response.statusCode < 500) {
        return;
      }
    } catch (_error) {
      // Le serveur n'est pas encore pret.
    }

    await wait(POLL_INTERVAL_MS);
  }

  throw new Error(`Le serveur ne repond pas apres ${STARTUP_TIMEOUT_MS / 1000}s`);
}

async function runHttpSmokeTests() {
  logStep("Tests HTTP (smoke tests)");

  const home = await httpGetJson("/");
  if (home.statusCode < 200 || home.statusCode >= 400) {
    throw new Error(`GET / doit retourner un code 2xx ou 3xx (recu ${home.statusCode})`);
  }

  const slots = await httpGetJson(`/available-times/${encodeURIComponent(TEST_DATE)}`);
  if (slots.statusCode !== 200) {
    throw new Error(`GET /available-times/${TEST_DATE} doit retourner 200 (recu ${slots.statusCode})`);
  }

  const payload = parseJsonOrThrow(slots.body, "/available-times");

  if (!Array.isArray(payload.available) || !Array.isArray(payload.booked) || !Array.isArray(payload.all)) {
    throw new Error("Le format JSON de /available-times est invalide");
  }

  const slotsInvalidDate = await httpGetJson("/available-times/date-invalide");
  if (slotsInvalidDate.statusCode !== 400) {
    throw new Error(`GET /available-times/date-invalide doit retourner 400 (recu ${slotsInvalidDate.statusCode})`);
  }

  const adminWithoutToken = await httpGetJson("/admin/users");
  if (adminWithoutToken.statusCode !== 401) {
    throw new Error(`GET /admin/users sans token doit retourner 401 (recu ${adminWithoutToken.statusCode})`);
  }

  const onboarding = await httpGetJson("/client-onboarding-status?email=email-invalide");
  if (onboarding.statusCode !== 200) {
    throw new Error(`GET /client-onboarding-status avec email invalide doit retourner 200 (recu ${onboarding.statusCode})`);
  }
  const onboardingPayload = parseJsonOrThrow(onboarding.body, "/client-onboarding-status");
  if (typeof onboardingPayload.found !== "boolean" || typeof onboardingPayload.hasPassword !== "boolean") {
    throw new Error("Le format JSON de /client-onboarding-status est invalide");
  }

  const loginInvalid = await httpRequest("/login", "POST", { email: "email-invalide", password: "abc123" });
  if (loginInvalid.statusCode !== 400) {
    throw new Error(`POST /login avec email invalide doit retourner 400 (recu ${loginInvalid.statusCode})`);
  }
  const loginInvalidPayload = parseJsonOrThrow(loginInvalid.body, "/login");
  if (typeof loginInvalidPayload.error !== "string" || !loginInvalidPayload.error.trim()) {
    throw new Error("La reponse erreur de /login est invalide");
  }

  console.log("[OK] Smoke API: /, /available-times, /client-onboarding-status, /login, /admin/users");
}

function startServer() {
  logStep("Demarrage du serveur local backend/server.js");

  serverProcess = spawn("node", [SERVER_ENTRY], {
    cwd: ROOT_DIR,
    stdio: "inherit"
  });

  serverProcess.on("error", (error) => {
    console.error(`[ERREUR] Echec du demarrage serveur: ${error.message}`);
    process.exit(1);
  });

  serverProcess.on("exit", (code) => {
    if (shuttingDown) {
      return;
    }
    if (code === 0) {
      logStep("Serveur arrete proprement (code 0)");
      process.exit(0);
      return;
    }
    console.error(`[ERREUR] Le serveur s'est arrete de facon inattendue (code ${code}).`);
    process.exit(typeof code === "number" ? code : 1);
  });
}

function stopServerAndExit(exitCode) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill("SIGINT");
    setTimeout(() => process.exit(exitCode), 800);
    return;
  }

  process.exit(exitCode);
}

async function main() {
  try {
    startServer();
    await waitForServer();
    logStep("Serveur pret");

    await runNodeScript(path.join("backend", "check-db.js"), "check-db.js");
    await runNodeScript(path.join("backend", "test-db.js"), "test-db.js");
    await runHttpSmokeTests();

    if (IS_CI_MODE) {
      logStep("Tous les tests sont valides. Fin du mode CI.");
      stopServerAndExit(0);
      return;
    }

    logStep("Tous les tests sont valides. Le serveur reste actif.");
    console.log("Appuyez sur Ctrl+C pour fermer.");
  } catch (error) {
    console.error(`[ERREUR] ${error.message}`);
    stopServerAndExit(1);
  }
}

process.on("SIGINT", () => {
  logStep("Arret demande");
  stopServerAndExit(0);
});

process.on("SIGTERM", () => {
  stopServerAndExit(0);
});

main();
