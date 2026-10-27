import { createServer } from "node:http";
import { readFile, realpath, stat } from "node:fs/promises";
import { dirname, extname, isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(SCRIPT_DIR, "..", "app");

const MIME_TYPES = Object.freeze({
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".txt": "text/plain; charset=utf-8",
});

function isWithin(root, candidate) {
  const relativePath = relative(root, candidate);
  return relativePath === ""
    || (relativePath !== ".."
      && !relativePath.startsWith(".." + sep)
      && !isAbsolute(relativePath));
}

export function parsePort(value, fallback = 8080) {
  if (value === undefined || value === null || value === "") return fallback;
  const text = String(value);
  if (!/^[0-9]+$/.test(text)) throw new Error("Port musi być liczbą całkowitą.");
  const port = Number(text);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("Port musi mieć wartość od 1 do 65535.");
  }
  return port;
}

export function resolveTargetPath(requestTarget, rootDir = APP_ROOT) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(requestTarget, "http://localhost").pathname);
  } catch {
    return null;
  }

  if (pathname.includes("\0") || pathname.includes("\\")) return null;

  const candidate = resolve(rootDir, pathname.replace(/^[/]+/, "") || "index.html");
  return isWithin(resolve(rootDir), candidate) ? candidate : null;
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  });
  response.end(message);
}

export function createStaticServer(options = {}) {
  const rootDir = resolve(options.rootDir ?? APP_ROOT);
  const realRootPromise = realpath(rootDir);

  return createServer(async (request, response) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      sendText(response, 405, "Metoda niedozwolona.");
      return;
    }

    const target = resolveTargetPath(request.url ?? "/", rootDir);
    if (!target) {
      sendText(response, 403, "Niedozwolona ścieżka.");
      return;
    }

    try {
      const realRoot = await realRootPromise;
      const realTarget = await realpath(target);
      if (!isWithin(realRoot, realTarget)) {
        sendText(response, 403, "Niedozwolona ścieżka.");
        return;
      }

      const details = await stat(realTarget);
      if (!details.isFile()) {
        sendText(response, 404, "Nie znaleziono pliku.");
        return;
      }

      const body = request.method === "HEAD" ? null : await readFile(realTarget);
      response.writeHead(200, {
        "Content-Length": String(details.size),
        "Content-Type": MIME_TYPES[extname(realTarget).toLowerCase()] ?? "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
      });
      response.end(body);
    } catch (error) {
      const code = error?.code === "ENOENT" || error?.code === "ENOTDIR" ? 404 : 500;
      sendText(response, code, code === 404 ? "Nie znaleziono pliku." : "Błąd serwera.");
    }
  });
}

export function readPort(argv = [], env = {}) {
  let argument;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--port") {
      if (!argv[index + 1]) throw new Error("Po opcji --port podaj numer portu.");
      argument = argv[index + 1];
      break;
    }
    if (item.startsWith("--port=")) {
      argument = item.slice("--port=".length);
      break;
    }
    if (/^[0-9]+$/.test(item)) {
      argument = item;
      break;
    }
  }
  return parsePort(argument ?? env.PORT);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = readPort(process.argv.slice(2), process.env);
  const server = createStaticServer();
  server.listen(port, "127.0.0.1", () => {
    process.stdout.write("Podgląd działa: http://localhost:" + port + "\n");
  });
}
