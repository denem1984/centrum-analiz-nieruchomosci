import test from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { createStaticServer, parsePort, readPort } from "../scripts/serve.mjs";

function get(port, requestPath) {
  return new Promise((resolve, reject) => {
    const outgoing = request({
      hostname: "127.0.0.1",
      port,
      path: requestPath,
      method: "GET",
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        contentType: response.headers["content-type"],
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    outgoing.on("error", reject);
    outgoing.end();
  });
}

test("serwer podaje stronę i moduł JS z poprawnymi typami MIME", async () => {
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;

  try {
    const home = await get(port, "/");
    assert.equal(home.status, 200);
    assert.match(home.contentType, /^text\/html/);
    assert.match(home.body, /Centrum Analiz Nieruchomości/);

    const script = await get(port, "/js/main.js");
    assert.equal(script.status, 200);
    assert.match(script.contentType, /^text\/javascript/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("serwer odrzuca próbę wyjścia poza katalog app", async () => {
  const server = createStaticServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  try {
    const response = await get(server.address().port, "/../README.md");
    assert.ok([403, 404].includes(response.status));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("port akceptuje argument, PORT lub wartość domyślną i odrzuca błędne wejście", () => {
  assert.equal(parsePort(undefined), 8080);
  assert.equal(readPort(["--port", "8090"], { PORT: "8081" }), 8090);
  assert.equal(readPort([], { PORT: "8081" }), 8081);
  assert.throws(() => parsePort("0"), /od 1 do 65535/);
  assert.throws(() => parsePort("abc"), /liczbą całkowitą/);
  assert.throws(() => readPort(["--port"], {}), /podaj numer portu/);
});
