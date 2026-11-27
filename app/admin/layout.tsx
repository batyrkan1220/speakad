"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import "./admin.css";

const NAV = [
  { href: "/admin/analytics", icon: "📊", label: "Analytics", sub: "Reels, avatars, ROI" },
  { href: "/admin/factory", icon: "🏭", label: "Actor Factory", sub: "Create library actors" },
  { href: "/admin/voices", icon: "🎙", label: "Voices", sub: "ElevenLabs slots" },
  { href: "/admin/subtitles", icon: "💬", label: "Subtitles", sub: "Caption style preview" },
];

/** One shell for every admin tool: a single login, one sidebar. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [st, setSt] = useState<null | { admin: boolean; configured: boolean }>(null);
  const [key, setKey] = useState("");
  const [err, setErr] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => { fetch("/api/admin", { cache: "no-store" }).then((r) => r.json()).then(setSt).catch(() => setSt({ admin: false, configured: false })); }, []);
  useEffect(() => setMenu(false), [path]);

  const login = async () => {
    setErr("");
    const r = await fetch("/api/admin", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ key }) });
    const j = await r.json().catch(() => ({}));
    if (r.ok) { setKey(""); location.reload(); } else setErr(j.error || "Wrong key");
  };
  const logout = async () => { await fetch("/api/admin", { method: "DELETE" }); location.href = "/"; };

  if (!st) return <div className="adm-center"><span className="spinner" /></div>;
  if (!st.admin) return (
    <div className="adm-center">
      <form className="adm-login" onSubmit={(e) => { e.preventDefault(); login(); }}>
        <div className="adm-logo">FA</div>
        <h1>FaceAd Admin</h1>
        {st.configured ? (
          <>
            <input type="password" placeholder="Admin key" value={key} autoFocus onChange={(e) => setKey(e.target.value)} />
            <button className="btn primary" type="submit" disabled={!key}>Sign in</button>
            {err && <p className="adm-err">{err}</p>}
          </>
        ) : <p className="adm-muted">Set the ADMIN_KEY environment variable on the server (Render → Environment) to enable the admin panel.</p>}
        <a href="/" className="adm-muted">← Back to the studio</a>
      </form>
    </div>
  );

  return (
    <div className={"adm" + (menu ? " open" : "")}>
      {menu && <div className="adm-veil" onClick={() => setMenu(false)} />}
      <aside className="adm-side">
        <div className="adm-brand"><div className="adm-logo">FA</div><div><b>FaceAd</b><span>Admin</span></div></div>
        <nav>
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className={"adm-nav" + (path?.startsWith(n.href) ? " on" : "")}>
              <i>{n.icon}</i><span><b>{n.label}</b><em>{n.sub}</em></span>
            </a>
          ))}
        </nav>
        <div className="adm-foot">
          <a href="/" className="adm-nav"><i>🎬</i><span><b>Open studio</b><em>What users see</em></span></a>
          <button className="adm-nav" onClick={logout}><i>⎋</i><span><b>Sign out</b></span></button>
        </div>
      </aside>
      <div className="adm-body">
        <div className="adm-top">
          <button className="adm-burger" aria-label="Menu" onClick={() => setMenu(true)}>☰</button>
          <b>{NAV.find((n) => path?.startsWith(n.href))?.label || "Admin"}</b>
        </div>
        <main className="adm-main">{children}</main>
      </div>
    </div>
  );
}
