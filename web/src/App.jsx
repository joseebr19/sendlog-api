import { useEffect, useState } from "react";
import "./App.css";

const CANALES = { tw: "Twitter", ig: "Instagram", mail: "Mail", discord: "Discord", phone: "Tel" };

function oyentes(n) {
  if (n === null || n === undefined) return "";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

function handle(c) {
  return c.twitter || c.instagram || c.discord || c.email || c.phone || "";
}

function canalDe(c) {
  if (c.twitter) return "tw";
  if (c.instagram) return "ig";
  if (c.discord) return "discord";
  if (c.email) return "mail";
  if (c.phone) return "phone";
  return "";
}

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [sends, setSends] = useState([]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/sends").then((r) => r.json()),
    ])
      .then(([c, s]) => { setContacts(c); setSends(s); })
      .catch((e) => setError(String(e)))
      .finally(() => setCargando(false));
  }, []);

  // ultimo envio de cada contacto
  const ultimo = {};
  for (const s of sends) {
    if (!ultimo[s.contact_id] || s.sent_at > ultimo[s.contact_id].sent_at) {
      ultimo[s.contact_id] = s;
    }
  }

  const tipos = [...new Set(contacts.map((c) => c.type).filter(Boolean))].sort();

  const filtrados = contacts.filter((c) => {
    if (tipo && c.type !== tipo) return false;
    if (!q) return true;
    const t = q.toLowerCase();
    return (
      c.name.toLowerCase().includes(t) ||
      (c.subgenre || "").toLowerCase().includes(t) ||
      handle(c).toLowerCase().includes(t)
    );
  });

  if (cargando) return <p className="estado">Cargando…</p>;
  if (error) return <p className="estado">Error: {error}</p>;

  return (
    <div className="app">
      <header>
        <h1>Placements</h1>
        <span className="contador">{filtrados.length} de {contacts.length}</span>
      </header>

      <div className="filtros">
        <input
          placeholder="Buscar por nombre, handle o subgénero…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Tipo</th>
            <th>Subgénero</th>
            <th>Contacto</th>
            <th>Oyentes</th>
            <th>Último envío</th>
            <th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map((c) => {
            const s = ultimo[c.id];
            return (
              <tr key={c.id}>
                <td className="nombre">{c.name}</td>
                <td>{c.type}</td>
                <td>{c.subgenre}</td>
                <td className="handle">
                  {handle(c)}
                  {canalDe(c) && <span className="canal">{CANALES[canalDe(c)]}</span>}
                </td>
                <td className="num">{oyentes(c.listeners)}</td>
                <td>{s ? s.sent_at : <span className="vacio">—</span>}</td>
                <td>
                  {s ? <span className={"badge " + s.status}>{s.status}</span> : <span className="vacio">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}