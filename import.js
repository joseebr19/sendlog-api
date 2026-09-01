// Convierte contacts.csv en import.sql para D1.
// Uso: node import.js

const fs = require("fs");

const USER_ID = "me";
const ANIO = "2026"; // el ano de las fechas de la hoja ("27 agosto")

const MESES = {
  enero: "01", febrero: "02", marzo: "03", abril: "04",
  mayo: "05", junio: "06", julio: "07", agosto: "08",
  septiembre: "09", octubre: "10", noviembre: "11", diciembre: "12",
};

const CANALES = { tw: "tw", mail: "mail", ig: "ig", discord: "discord" };

const ESTADOS = {
  pendiente: "pending",
  respondio: "replied",
  produciendo: "producing",
  usado: "used",
  publicado: "released",
  descartado: "declined",
  "sin respuesta": "no_reply",
};

// --- parser de CSV (soporta comillas y saltos de linea dentro de celda) ---
function parseCSV(texto) {
  const filas = [];
  let fila = [];
  let celda = "";
  let enComillas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];

    if (enComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') { celda += '"'; i++; }
        else enComillas = false;
      } else celda += c;
      continue;
    }

    if (c === '"') enComillas = true;
    else if (c === ",") { fila.push(celda); celda = ""; }
    else if (c === "\n") { fila.push(celda); filas.push(fila); fila = []; celda = ""; }
    else if (c !== "\r") celda += c;
  }
  if (celda !== "" || fila.length) { fila.push(celda); filas.push(fila); }
  return filas;
}

// --- helpers ---
const limpiar = (v) => (v || "").replace(/\r|\n/g, " ").trim();

function sql(v) {
  if (v === null || v === undefined || v === "") return "NULL";
  if (typeof v === "number") return String(v);
  return "'" + String(v).replace(/'/g, "''") + "'";
}

function oyentes(v) {
  const t = limpiar(v).toLowerCase().replace(/\s/g, "");
  if (!t) return null;
  const m = t.match(/^([\d.,]+)([km]?)$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(",", "."));
  if (isNaN(n)) return null;
  if (m[2] === "k") return Math.round(n * 1000);
  if (m[2] === "m") return Math.round(n * 1000000);
  return Math.round(n);
}

function fecha(v) {
  const t = limpiar(v).toLowerCase();
  if (!t) return null;
  const m = t.match(/^(\d{1,2})\s+([a-zá-ú]+)$/);
  if (!m) return null;
  const mes = MESES[m[2]];
  if (!mes) return null;
  return `${ANIO}-${mes}-${m[1].padStart(2, "0")}`;
}

const tipo = (v) => limpiar(v).replace(/\s*\+\s*/, "+").toLowerCase() || null;
const subgenero = (v) => limpiar(v).toLowerCase() || null;

// --- proceso ---
const filas = parseCSV(fs.readFileSync("contacts.csv", "utf8"));
const cabeceras = filas.shift().map(limpiar);
const idx = (n) => cabeceras.indexOf(n);

const col = {
  nombre: idx("Nombre"), tipo: idx("Tipo"), subg: idx("Subg"),
  contacto: idx("Contacto"), rs: idx("RS"), fecha: idx("Fecha Envío"),
  pack: idx("Pack Enviado"), estado: idx("Estado"),
  notas: idx("Notas"), oyentes: idx("Oyentes"),
};

const lineas = [];
const packs = new Map();
const avisos = [];
let nContactos = 0;
let nEnvios = 0;
let contactId = 0;

// packs primero
const nombresPack = new Set();
for (const f of filas) {
  const p = limpiar(f[col.pack]);
  if (p) nombresPack.add(p);
}
let packId = 0;
for (const p of nombresPack) {
  packs.set(p, ++packId);
  lineas.push(
    `INSERT INTO packs (id, user_id, name) VALUES (${packId}, ${sql(USER_ID)}, ${sql(p)});`
  );
}

// contactos y envios
filas.forEach((f, i) => {
  const nombre = limpiar(f[col.nombre]);
  if (!nombre) return; // filas vacias

  const contacto = limpiar(f[col.contacto]);
  const rs = limpiar(f[col.rs]).toLowerCase();
  const canal = CANALES[rs] || null;

  let twitter = null, instagram = null, email = null, discord = null;
  if (contacto) {
    if (canal === "tw") twitter = contacto;
    else if (canal === "ig") instagram = contacto;
    else if (canal === "mail") email = contacto;
    else if (canal === "discord") discord = contacto;
    else {
      avisos.push(`fila ${i + 2} (${nombre}): RS "${f[col.rs]}" no reconocido, contacto sin asignar`);
    }
  }

  contactId++;
  nContactos++;
  lineas.push(
    `INSERT INTO contacts (id, user_id, name, type, subgenre, listeners, twitter, instagram, discord, email, notes) VALUES (` +
      [
        contactId, sql(USER_ID), sql(nombre), sql(tipo(f[col.tipo])),
        sql(subgenero(f[col.subg])), oyentes(f[col.oyentes]) ?? "NULL",
        sql(twitter), sql(instagram), sql(discord), sql(email),
        sql(limpiar(f[col.notas]) || null),
      ].join(", ") + `);`
  );

  // envio, solo si hay algo en fecha/pack/estado
  const pack = limpiar(f[col.pack]);
  const estadoBruto = limpiar(f[col.estado]);
  const fechaEnvio = fecha(f[col.fecha]);
  if (!pack && !estadoBruto && !fechaEnvio) return;

  const estado = ESTADOS[estadoBruto.toLowerCase()] || "pending";
  if (estadoBruto && !ESTADOS[estadoBruto.toLowerCase()]) {
    avisos.push(`fila ${i + 2} (${nombre}): estado "${estadoBruto}" no reconocido, se guarda como pending`);
  }
  if (!canal) {
    avisos.push(`fila ${i + 2} (${nombre}): envio sin canal valido, se omite`);
    return;
  }

  nEnvios++;
  lineas.push(
    `INSERT INTO sends (user_id, contact_id, pack_id, channel, sent_at, status) VALUES (` +
      [
        sql(USER_ID), contactId, pack ? packs.get(pack) : "NULL",
        sql(canal), sql(fechaEnvio || "1970-01-01"), sql(estado),
      ].join(", ") + `);`
  );
});

fs.writeFileSync("import.sql", lineas.join("\n") + "\n");

console.log(`packs:     ${packs.size}`);
console.log(`contactos: ${nContactos}`);
console.log(`envios:    ${nEnvios}`);
if (avisos.length) {
  console.log("\navisos:");
  avisos.forEach((a) => console.log("  - " + a));
}
console.log("\nimport.sql generado");