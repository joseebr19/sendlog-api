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

function Login() {
  return (
    <div className="login">
      <h1>Send Log</h1>
      <p>Track who you send your packs to, and what came back.</p>
      <a className="btn-google" href="/api/auth/login">Sign in with Google</a>
      <p className="fine">Your contacts are private and only visible to you.</p>
    </div>
  );
}

function SendRow({ send, packs, onSave, onDelete, onNewPack }) {
  const [s, setS] = useState(send);
  const set = (k) => (e) => {
    const next = { ...s, [k]: e.target.value };
    setS(next);
    onSave(next);
  };

  const setStatus = (e) => {
    const status = e.target.value;
    let result_url = s.result_url;
    if (status === "released" && !result_url) {
      const url = prompt("Link to the result (video, Spotify, etc.) — optional, you can add it later:");
      if (url && url.trim()) result_url = url.trim();
    }
    const next = { ...s, status, result_url };
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
    <div className="send-row-wrap">
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
        <select value={s.status} onChange={setStatus}>
          {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
        </select>
        <button className="danger small" onClick={() => onDelete(s.id)}>×</button>
      </div>
      {s.status === "released" && (
        <input
          className="result-url-input"
          type="url"
          placeholder="Link to the result…"
          value={s.result_url || ""}
          onChange={set("result_url")}
        />
      )}
    </div>
  );
}

function BulkDialog({ count, packs, onSend, onCancel, onNewPack }) {
  const [packId, setPackId] = useState(packs[0]?.id ?? "");
  const [date, setDate] = useState(today());
  const [sending, setSending] = useState(false);

  const changePack = async (e) => {
    if (e.target.value === "__new__") {
      const name = prompt("Pack name:");
      if (!name || !name.trim()) return;
      const pack = await onNewPack(name.trim());
      if (pack) setPackId(pack.id);
      return;
    }
    setPackId(e.target.value);
  };

  return (
    <div className="modal" onClick={onCancel}>
      <div className="dialog narrow" onClick={(e) => e.stopPropagation()}>
        <h2>Log send for {count} contact{count === 1 ? "" : "s"}</h2>

        <label>Pack
          <select value={packId} onChange={changePack}>
            <option value="">no pack</option>
            {packs.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            <option value="__new__">+ New pack…</option>
          </select>
        </label>

        <label>Date<input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>

        <p className="note">Each contact uses its own channel. Contacts with no handle are skipped.</p>

        <div className="actions">
          <span className="spacer" />
          <button onClick={onCancel}>Cancel</button>
          <button className="primary" disabled={sending} onClick={async () => {
            setSending(true);
            await onSend(packId, date);
            setSending(false);
          }}>
            {sending ? "Saving…" : "Log send"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ContactForm({ initial, packs, sends, subgenres, onSave, onCancel, onDelete, onSaveSend, onDeleteSend, onNewSend, onNewPack }) {
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
              <label>Subgenre
                <input list="subgenres" value={f.subgenre} onChange={set("subgenre")} />
                <datalist id="subgenres">
                  {subgenres.map((s) => <option key={s} value={s} />)}
                </datalist>
              </label>
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
  const [me, setMe] = useState(null);
  const [checking, setChecking] = useState(true);
  const [contacts, setContacts] = useState([]);
  const [sends, setSends] = useState([]);
  const [packs, setPacks] = useState([]);
  const [followups, setFollowups] = useState([]);
  const [view, setView] = useState("contacts");
  const [days, setDays] = useState(14);
  const [q, setQ] = useState("");
  const [type, setType] = useState("");
  const [sort, setSort] = useState("name");
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    if (!me) return;
    Promise.all([
      fetch("/api/contacts").then((r) => r.json()),
      fetch("/api/sends").then((r) => r.json()),
      fetch("/api/packs").then((r) => r.json()),
    ])
      .then(([c, s, p]) => { setContacts(c); setSends(s); setPacks(p); })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [me]);

  useEffect(() => {
    if (!me) return;
    fetch(`/api/followups?days=${days}`)
      .then((r) => r.json())
      .then(setFollowups)
      .catch((e) => setError(String(e)));
  }, [days, sends, me]);

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
    setSends((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...s, pack_name: packName(s.pack_id) } : x)));
    const res = await fetch(`/api/sends/${s.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(s),
    });
    if (!res.ok) setError("Could not save send");
  };

  const changeStatus = (record, status) => {
    let result_url = record.result_url;
    if (status === "released" && !result_url) {
      const url = prompt("Link to the result (video, Spotify, etc.) — optional, you can add it later:");
      if (url && url.trim()) result_url = url.trim();
    }
    saveSend({ ...record, status, result_url });
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

  const bulkSend = async (pack_id, sent_at) => {
    const list = [...selected]
      .map((id) => contacts.find((c) => c.id === id))
      .filter(Boolean)
      .map((c) => ({ id: c.id, channel: channelOf(c) }))
      .filter((c) => c.channel);

    if (!list.length) { setError("No valid contacts selected"); return; }

    const res = await fetch("/api/sends/bulk", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ pack_id: pack_id || null, sent_at, contacts: list }),
    });
    if (!res.ok) { setError("Could not create sends"); return; }
    const created = await res.json();
    setSends((prev) => [...prev, ...created]);
    setSelected(new Set());
    setBulkOpen(false);
  };

  const deleteAccount = async () => {
    const typed = prompt(`This deletes your account and ALL your data (contacts, sends, packs) forever.\n\nType your email to confirm: ${me.email}`);
    if (typed !== me.email) return;

    const res = await fetch("/api/me", { method: "DELETE" });
    if (!res.ok) { setError("Could not delete account"); return; }
    window.location.href = "/";
  };

  const toggle = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const last = {};
  const sendCount = {};
  for (const s of sends) {
    sendCount[s.contact_id] = (sendCount[s.contact_id] || 0) + 1;
    if (!last[s.contact_id] || s.sent_at > last[s.contact_id].sent_at) last[s.contact_id] = s;
  }

  const types = [...new Set(contacts.map((c) => c.type).filter(Boolean))].sort();
  const subgenres = [...new Set(contacts.map((c) => c.subgenre).filter(Boolean))].sort();

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

  const toggleAll = () => {
    setSelected((prev) =>
      prev.size === visible.length ? new Set() : new Set(visible.map((c) => c.id))
    );
  };

  if (checking) return <p className="state">Loading…</p>;
  if (!me) return <Login />;
  if (loading) return <p className="state">Loading…</p>;

  return (
    <div className="app">
      <header>
        <h1>Send Log</h1>
        <div className="tabs top">
          <button className={view === "contacts" ? "on" : ""} onClick={() => setView("contacts")}>Contacts</button>
          <button className={view === "followups" ? "on" : ""} onClick={() => setView("followups")}>
            Follow-up {followups.length > 0 && <span className="count">{followups.length}</span>}
          </button>
        </div>
        <span className="spacer" />
        {view === "contacts" && <button className="primary" onClick={() => setEditing({})}>+ New</button>}
        <div className="user">
          {me.avatar_url && <img src={me.avatar_url} alt="" />}
          <a href="#" className="danger-link" onClick={(e) => { e.preventDefault(); deleteAccount(); }}>Delete account</a>
          <a href="/api/auth/logout" title="Sign out">Sign out</a>
        </div>
      </header>

      {error && <p className="error" onClick={() => setError(null)}>{error} (click to dismiss)</p>}

      {view === "contacts" && (
        <>
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

          <table className="t-contacts">
            <thead>
              <tr>
                <th className="check">
                  <input
                    type="checkbox"
                    checked={visible.length > 0 && selected.size === visible.length}
                    onChange={toggleAll}
                  />
                </th>
                <th>Name</th><th>Type</th><th>Subgenre</th><th>Contact</th>
                <th className="num">Listeners</th><th>Pack</th><th>Last sent</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((c) => {
                const s = last[c.id];
                const n = sendCount[c.id] || 0;
                return (
                  <tr key={c.id} className={selected.has(c.id) ? "sel" : ""}>
                    <td className="check">
                      <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                    </td>
                    <td className="name">
                      <span className="clickable" onClick={() => setEditing(c)}>{c.name}</span>
                      {n > 1 && <span className="times" title={`${n} sends`}>×{n}</span>}
                    </td>
                    <td>{c.type}</td>
                    <td>{c.subgenre}</td>
                    <td className="handle">
                      <span className="handle-text">{handleOf(c)}</span>
                      {channelOf(c) && <span className="channel">{CHANNELS[channelOf(c)]}</span>}
                    </td>
                    <td className="num">{formatListeners(c.listeners)}</td>
                    <td>{s ? s.pack_name : <span className="empty">—</span>}</td>
                    <td>{s ? s.sent_at : <span className="empty">—</span>}</td>
                    <td>
                      {s ? (
                        <>
                          <select
                            className={"badge-select " + s.status}
                            value={s.status}
                            onChange={(e) => changeStatus(s, e.target.value)}
                          >
                            {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                          </select>
                          {s.result_url && (
                            <a className="result-link" href={s.result_url} target="_blank" rel="noopener noreferrer" title="View result">🔗</a>
                          )}
                        </>
                      ) : <span className="empty">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}

      {view === "followups" && (
        <>
          <div className="filters">
            <span className="note">Pending sends older than</span>
            <select value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
            </select>
          </div>

          {followups.length === 0 && <p className="empty-note">Nothing to follow up on.</p>}

          {followups.length > 0 && (
            <table className="t-follow">
              <thead>
                <tr>
                  <th>Name</th><th>Contact</th><th>Pack</th><th>Sent</th><th>Waiting</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {followups.map((f) => {
                  const c = contacts.find((x) => x.id === f.contact_id);
                  return (
                    <tr key={f.id}>
                      <td className="name">
                        <span className="clickable" onClick={() => c && setEditing(c)}>{f.contact_name}</span>
                      </td>
                      <td className="handle">{f.twitter || f.instagram || f.discord || f.email}</td>
                      <td>{f.pack_name || <span className="empty">—</span>}</td>
                      <td>{f.sent_at}</td>
                      <td className={f.days_ago >= 30 ? "stale" : ""}>{f.days_ago}d</td>
                      <td>
                        <select
                          className={"badge-select " + f.status}
                          value={f.status}
                          onChange={(e) => changeStatus(f, e.target.value)}
                        >
                          {STATUS_KEYS.map((k) => <option key={k} value={k}>{STATUS[k]}</option>)}
                        </select>
                        {f.result_url && (
                          <a className="result-link" href={f.result_url} target="_blank" rel="noopener noreferrer" title="View result">🔗</a>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>
      )}

      {selected.size > 0 && view === "contacts" && (
        <div className="bulkbar">
          <span>{selected.size} selected</span>
          <button onClick={() => setSelected(new Set())}>Clear</button>
          <button className="primary" onClick={() => setBulkOpen(true)}>Log send</button>
        </div>
      )}

      {bulkOpen && (
        <BulkDialog
          count={selected.size}
          packs={packs}
          onSend={bulkSend}
          onCancel={() => setBulkOpen(false)}
          onNewPack={newPack}
        />
      )}

      {editing && (
        <ContactForm
          initial={editing}
          packs={packs}
          sends={sends}
          subgenres={subgenres}
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