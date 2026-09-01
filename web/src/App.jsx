import { useEffect, useState } from "react";
import "./App.css";

const CHANNELS = { tw: "X", ig: "Instagram", mail: "Mail", discord: "Discord" };
const STATUS = {
  pending: "pending", replied: "replied", producing: "producing",
  used: "used", released: "released", declined: "declined", no_reply: "no reply",
};
const STATUS_KEYS = Object.keys(STATUS);
const EMPTY = { name: "", type: "", subgenre: "", listeners: "", twitter: "", instagram: "", discord: "", email: "", phone: "", notes: "" };

const today = () => new Date().toISOString().slice(0, 10);

function formatListeners(n) {
  if (n === null || n === undefined) return "";
  if (n >= 1000000) return (n / 1000000).toFixed(1).replace(".0", "") + "M";
  if (n >= 1000) return Math.round(n / 1000) + "k";
  return String(n);
}

const handleOf = (c) => c.twitter || c.instagram || c.discord || c.email || "";

function channelOf(c) {
  if (c.twitter) return "tw";
  if (c.instagram) return "ig";
  if (c.discord) return "discord";
  if (c.email) return "mail";
  return "";
}

function SendRow({ send, packs, onSave, onDelete, onNewPack }) {
  const [s, setS] = useState(send);
  const set = (k) => (e) => {
    const next = { ...s, [k]: e.target.value };
    setS(next);
    onSave(next);
  };

  const changePack = async (e) => {
    if (e.target.value === "__new__") {
      const name = prompt("Pack name:");
      if (!name || !name.trim()) return;
      const pack = await onNewPack(name.trim());
      if (!pack) return;
      const next = { ...s, pack_id: pack.id };
      setS(next);
      onSave(next);
      return;
    }
    set("pack_id")(e);
  };

  return (
    <div className="send-row">
      <select value={s.pack_id ?? ""} onChange={changePack}>
        <option value="">no pack</option>
        {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        <option value="__new__">+ New pack…</option>
      </select>
      <select value={s.channel} onChange={set("channel")}>
        {Object.entries(CHANNELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
      </select>
      <input type="date" value={s.sent_at} onChange={set("sent_at")} />
      <select value={s.status} onChange={set("status")}>
        {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
      </select>
      <button className="danger small" onClick={() => onDelete(s.id)}>×</button>
    </div>
  );
}

function ContactForm({ initial, packs, sends, onSave, onCancel, onDelete, onSaveSend, onDeleteSend, onNewSend, onNewPack }) {
  const [f, setF] = useState({ ...EMPTY, ...initial, listeners: initial?.listeners ?? "" });
  const [tab, setTab] = useState("data");
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const save = async () => {
    if (!f.name.trim()) return;
    setSaving(true);
    await onSave({ ...f, listeners: f.listeners === "" ? null : Number(f.listeners) });
    setSaving(false);
  };

  const mine = sends
    .filter((s) => s.contact_id === initial?.id)
    .sort((a, b) => b.sent_at.localeCompare(a.sent_at));

  return (
    <div className="modal" onClick={onCancel}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <h2>{initial?.id ? initial.name : "New contact"}</h2>

        {initial?.id && (
          <div className="tabs">
            <button className={tab === "data" ? "on" : ""} onClick={() => setTab("data")}>Details</button>
            <button className={tab === "sends" ? "on" : ""} onClick={() => setTab("sends")}>
              Sends {mine.length > 0 && <span className="count">{mine.length}</span>}
            </button>
          </div>
        )}

        {tab === "data" && (
          <>
            <label>Name<input value={f.name} onChange={set("name")} autoFocus /></label>

            <div className="row">
              <label>Type
                <select value={f.type} onChange={set("type")}>
                  <option value="">—</option>
                  <option value="prod">prod</option>
                  <option value="artist">artist</option>
                  <option value="prod+artist">prod+artist</option>
                </select>
              </label>
              <label>Subgenre<input value={f.subgenre} onChange={set("subgenre")} /></label>
              <label>Listeners<input type="number" value={f.listeners} onChange={set("listeners")} /></label>
            </div>

            <div className="row">
              <label>X<input value={f.twitter} onChange={set("twitter")} placeholder="@handle" /></label>
              <label>Instagram<input value={f.instagram} onChange={set("instagram")} placeholder="@handle" /></label>
            </div>

            <div className="row">
              <label>Discord<input value={f.discord} onChange={set("discord")} /></label>
              <label>Email<input value={f.email} onChange={set("email")} /></label>
            </div>

            <label>Notes<textarea rows="2" value={f.notes} onChange={set("notes")} /></label>

            <div className="actions">
              {initial?.id && <button className="danger" onClick={() => onDelete(initial.id)}>Delete</button>}
              <span className="spacer" />
              <button onClick={onCancel}>Cancel</button>
              <button className="primary" onClick={save} disabled={saving || !f.name.trim()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </>
        )}

        {tab === "sends" && (
          <>
            <div className="send-head">
              <span>Pack</span><span>Channel</span><span>Sent</span><span>Status</span><span />
            </div>

            {mine.length === 0 && <p className="empty-note">No sends yet.</p>}

            {mine.map((s) => (
              <SendRow
                key={s.id}
                send={s}
                packs={packs}
                onSave={onSaveSend}
                onDelete={onDeleteSend}
                onNewPack={onNewPack}
              />
            ))}

            <div className="actions">
              <button onClick={() => onNewSend(initial.id, channelOf(initial) || "tw")}>+ Add send</button>
              <span className="spacer" />
              <button onClick={onCancel}>Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [contacts, setContacts] = useState([]);
  const [sends, setSends] = useState([]);
  const [packs, setPacks] = useState([]);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("name");
  const [editing, setEditing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/sends").then((r) => r.json()),
      fetch("/api/packs").then((r) => r.json()),
    ])
      .then(([c, s, p]) => { setContacts(c); setSends(s); setPacks(p); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  const packName = (id) => packs.find((p) => p.id === Number(id))?.name ?? null;

  const save = async (data) => {
    const isEdit = Boolean(data.id);
    const res = await fetch(isEdit ? `/api/contacts/${data.id}` : "/api/contacts", {
      method: isEdit ? "PUT" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!res.ok) { setError("Could not save"); return; }
    const saved = await res.json();
    setContacts((prev) =>
      isEdit ? prev.map((c) => (c.id === saved.id ? saved : c)) : [...prev, saved]
    );
    setEditing(null);
  };

  const remove = async (id) => {
    if (!confirm("Delete this contact and all its sends?")) return;
    const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Could not delete"); return; }
    setContacts((prev) => prev.filter((c) => c.id !== id));
    setSends((prev) => prev.filter((s) => s.contact_id !== id));
    setEditing(null);
  };

  const saveSend = async (s) => {
    setSends((prev) => prev.map((x) => (x.id === s.id ? { ...s, pack_name: packName(s.pack_id) } : x)));
    const res = await fetch(`/api/sends/${s.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s),
    });
    if (!res.ok) setError("Could not save send");
  };

  const newSend = async (contact_id, channel) => {
    const res = await fetch("/api/sends", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contact_id, channel, sent_at: today(), pack_id: packs[0]?.id ?? null }),
    });
    if (!res.ok) { setError("Could not create send"); return; }
    const created = await res.json();
    const c = contacts.find((x) => x.id === contact_id);
    setSends((prev) => [...prev, { ...created, contact_name: c?.name, pack_name: packName(created.pack_id) }]);
  };

  const deleteSend = async (id) => {
    const res = await fetch(`/api/sends/${id}`, { method: "DELETE" });
    if (!res.ok) { setError("Could not delete send"); return; }
    setSends((prev) => prev.filter((s) => s.id !== id));
  };

  const newPack = async (name) => {
    const res = await fetch("/api/packs", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) { setError("Could not create pack"); return null; }
    const created = await res.json();
    setPacks((prev) => [created, ...prev]);
    return created;
  };

  const last = {};
  const sendCount = {};
  for (const s of sends) {
    sendCount[s.contact_id] = (sendCount[s.contact_id] || 0) + 1;
    if (!last[s.contact_id] || s.sent_at > last[s.contact_id].sent_at) last[s.contact_id] = s;
  }

  const types = [...new Set(contacts.map((c) => c.type).filter(Boolean))].sort();

  const visible = contacts
    .filter((c) => {
      if (type && c.type !== type) return false;
      if (!q) return true;
      const t = q.toLowerCase();
      return c.name.toLowerCase().includes(t) ||
        (c.subgenre || "").toLowerCase().includes(t) ||
        handleOf(c).toLowerCase().includes(t);
    })
    .sort((a, b) => {
      if (sort === "listeners") return (b.listeners ?? -1) - (a.listeners ?? -1);
      if (sort === "sent") {
        return (last[b.id]?.sent_at || "").localeCompare(last[a.id]?.sent_at || "");
      }
      return a.name.localeCompare(b.name, "en", { sensitivity: "base" });
    });

  if (loading) return <p className="state">Loading…</p>;

  return (
    <div className="app">
      <header>
        <h1>Placements</h1>
        <span className="count">{visible.length} of {contacts.length}</span>
        <span className="spacer" />
        <button className="primary" onClick={() => setEditing({})}>+ New</button>
      </header>

      {error && <p className="error" onClick={() => setError(null)}>{error} (click to dismiss)</p>}

      <div className="filters">
        <input placeholder="Search by name, handle or subgenre…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={type} onChange={(e) => setType(e.target.value)}>
          <option value="">All types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value)}>
          <option value="name">Name</option>
          <option value="listeners">Listeners</option>
          <option value="sent">Last sent</option>
        </select>
      </div>

      <table>
        <thead>
          <tr>
            <th>Name</th><th>Type</th><th>Subgenre</th><th>Contact</th>
            <th className="num">Listeners</th><th>Pack</th><th>Last sent</th><th>Status</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => {
            const s = last[c.id];
            const n = sendCount[c.id] || 0;
            return (
              <tr key={c.id}>
                <td className="name">
                  <span className="clickable" onClick={() => setEditing(c)}>{c.name}</span>
                  {n > 1 && <span className="times" title={`${n} sends`}>×{n}</span>}
                </td>
                <td>{c.type}</td>
                <td>{c.subgenre}</td>
                <td className="handle">
                  {handleOf(c)}
                  {channelOf(c) && <span className="channel">{CHANNELS[channelOf(c)]}</span>}
                </td>
                <td className="num">{formatListeners(c.listeners)}</td>
                <td>{s ? s.pack_name : <span className="empty">—</span>}</td>
                <td>{s ? s.sent_at : <span className="empty">—</span>}</td>
                <td>
                  {s ? (
                    <select
                      className={"badge-select " + s.status}
                      value={s.status}
                      onChange={(e) => saveSend({ ...s, status: e.target.value })}
                    >
                      {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                    </select>
                  ) : <span className="empty">—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {editing && (
        <ContactForm
          initial={editing}
          packs={packs}
          sends={sends}
          onSave={save}
          onCancel={() => setEditing(null)}
          onDelete={remove}
          onSaveSend={saveSend}
          onDeleteSend={deleteSend}
          onNewSend={newSend}
          onNewPack={newPack}
        />
      )}
    </div>
  );
}