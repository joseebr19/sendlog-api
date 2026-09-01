import { useEffect, useState } from "react";
import "./App.css";

const CANALES = { tw: "Twitter", ig: "Instagram", mail: "Mail", discord: "Discord", phone: "Tel" };
const VACIO = { name: "", type: "", subgenre: "", listeners: "", twitter: "", instagram: "", discord: "", email: "", phone: "", notes: "" };

function oyentes(n) {
  if (n === null || n === undefined) return "";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

const handle = (c) => c.twitter || c.instagram || c.discord || c.email || c.phone || "";

function canalDe(c) {
  if (c.twitter) return "tw";
  if (c.instagram) return "ig";
  if (c.discord) return "discord";
  if (c.email) return "mail";
  if (c.phone) return "phone";
  return "";
}

function Formulario({ inicial, onGuardar, onCancelar, onBorrar }) {
  const [f, setF] = useState({ ...VACIO, ...inicial, listeners: inicial?.listeners ?? "" });
  const [guardando, setGuardando] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const guardar = async () => {
    if (!f.name.trim()) return;
    setGuardando(true);
    await onGuardar({ ...f, listeners: f.listeners === "" ? null : Number(f.listeners) });
    setGuardando(false);
  };

  return (
    <div className="modal" onClick={onCancelar}>
      <div className="dialogo" onClick={(e) => e.stopPropagation()}>
        <h2>{inicial?.id ? "Editar contacto" : "Nuevo contacto"}</h2>

        <label>Nombre<input value={f.name} onChange={set("name")} autoFocus /></label>

        <div className="fila">
          <label>Tipo
            <select value={f.type} onChange={set("type")}>
              <option value="">—</option>
              <option value="prod">prod</option>
              <option value="artist">artist</option>
              <option value="prod+artist">prod+artist</option>
            </select>
          </label>
          <label>Subgénero<input value={f.subgenre} onChange={set("subgenre")} /></label>
          <label>Oyentes<input type="number" value={f.listeners} onChange={set("listeners")} /></label>
        </div>

        <div className="fila">
          <label>Twitter<input value={f.twitter} onChange={set("twitter")} placeholder="@handle" /></label>
          <label>Instagram<input value={f.instagram} onChange={set("instagram")} placeholder="@handle" /></label>
        </div>

        <div className="fila">
          <label>Discord<input value={f.discord} onChange={set("discord")} /></label>
          <label>Email<input value={f.email} onChange={set("email")} /></label>
        </div>

        <label>Notas<textarea rows="2" value={f.notes} onChange={set("notes")} /></label>

        <div className="acciones">
          {inicial?.id && <button className="peligro" onClick={() => onBorrar(inicial.id)}>Borrar</button>}
          <span className="espacio" />
          <button onClick={onCancelar}>Cancelar</button>
          <button className="primario" onClick={guardar} disabled={guardando || !f.name.trim()}>
            {guardando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [sends, setSends] = useState([]);
  const [q, setQ] = useState("");
  const [tipo, setTipo] = useState("");
  const [orden, setOrden] = useState("name");
  const [editando, setEditando] = useState(null);
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

  const guardar = async (datos) => {
    const editar = Boolean(datos.id);
    const res = await fetch(editar ? `/api/contacts/${datos.id}` : "/api/contacts", {
      method: editar ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(datos),
    });
    if (!res.ok) { setError("No se pudo guardar"); return; }
    const guardado = await res.json();
    setContacts((prev) =>
      editar ? prev.map((c) => (c.id === guardado.id ? guardado : c)) : [...prev, guardado]
    );
    setEditando(null);
  };

  const borrar = async (id) => {
    if (!confirm("¿Borrar este contacto y todos sus envíos?")) return;
    const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("No se pudo borrar"); return; }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSends((prev) => prev.filter((s) => s.contact_id !== id));
    setEditando(null);
  };

  const ultimo = {};
  for (const s of sends) {
    if (!ultimo[s.contact_id] || s.sent_at > ultimo[s.contact_id].sent_at) ultimo[s.contact_id] = s;
  }

  const tipos = [...new Set(contacts.map((c) => c.type).filter(Boolean))].sort();

  const filtrados = contacts
    .filter((c) => {
      if (tipo && c.type !== tipo) return false;
      if (tipo === "__sin_envio__" && ultimo[c.id]) return false;
      if (!q) return true;
      const t = q.toLowerCase();
      return c.name.toLowerCase().includes(t) ||
        (c.subgenre || "").toLowerCase().includes(t) ||
        handle(c).toLowerCase().includes(t);
    })
    .sort((a, b) => {
      if (orden === "listeners") return (b.listeners ?? -1) - (a.listeners ?? -1);
      if (orden === "sent") {
        const fa = ultimo[a.id]?.sent_at || "";
        const fb = ultimo[b.id]?.sent_at || "";
        return fb.localeCompare(fa);
      }
      return a.name.localeCompare(b.name, "es", { sensitivity: "base" });
    });

  if (cargando) return <p className="estado">Cargando…</p>;

  return (
    <div className="app">
      <header>
        <h1>Placements</h1>
        <span className="contador">{filtrados.length} de {contacts.length}</span>
        <span className="espacio" />
        <button className="primario" onClick={() => setEditando({})}>+ Nuevo</button>
      </header>

      {error && <p className="error" onClick={() => setError(null)}>{error} (clic para cerrar)</p>}

      <div className="filtros">
        <input placeholder="Buscar por nombre, handle o subgénero…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          <option value="">Todos los tipos</option>
          {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={orden} onChange={(e) => setOrden(e.target.value)}>
          <option value="name">Nombre</option>
          <option value="listeners">Oyentes</option>
          <option value="sent">Último envío</option>
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Nombre</th><th>Tipo</th><th>Subgénero</th><th>Contacto</th>
            <th className="num">Oyentes</th><th>Último envío</th><th>Estado</th>
          </tr>
        </thead>
        <tbody>
          {filtrados.map((c) => {
            const s = ultimo[c.id];
            return (
              <tr key={c.id} onClick={() => setEditando(c)}>
                <td className="nombre">{c.name}</td>
                <td>{c.type}</td>
                <td>{c.subgenre}</td>
                <td className="handle">
                  {handle(c)}
                  {canalDe(c) && <span className="canal">{CANALES[canalDe(c)]}</span>}
                </td>
                <td className="num">{oyentes(c.listeners)}</td>
                <td>{s ? s.sent_at : <span className="vacio">—</span>}</td>
                <td>{s ? <span className={"badge " + s.status}>{s.status}</span> : <span className="vacio">—</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editando && (
        <Formulario
          inicial={editando}
          onGuardar={guardar}
          onCancelar={() => setEditando(null)}
          onBorrar={borrar}
        />
      )}
    </div>
  );
}