"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Link2, Globe, Lock, X } from "lucide-react";
import { Modal, Button, TextInput } from "@/components/ui/Modal";
import { api } from "@/lib/client";
import type { NodeDTO } from "@/lib/nodes";

type ShareState = {
  users: { id: string; userId: string; name: string; email: string; role: string }[];
  link: { token: string; role: string } | null;
};

type Props = { open: boolean; node: NodeDTO | null; onClose: () => void; onChanged: () => void; toast: (m: string) => void };

/** Remounts its body on open so the fetched state and form reset each time. */
export function ShareModal({ open, node, onClose, onChanged, toast }: Props) {
  return (
    <Modal open={open && !!node} onClose={onClose} title={`Share "${node?.name ?? ""}"`} width="max-w-lg">
      {open && node && <ShareBody node={node} onClose={onClose} onChanged={onChanged} toast={toast} />}
    </Modal>
  );
}

function ShareBody({ node, onClose, onChanged, toast }: Omit<Props, "open"> & { node: NodeDTO }) {
  const [state, setState] = useState<ShareState | null>(null);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"VIEWER" | "EDITOR">("VIEWER");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const base = `/api/nodes/${node.id}/share`;

  useEffect(() => {
    let cancelled = false;
    api<ShareState>(base)
      .then((s) => !cancelled && setState(s))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [base]);

  async function run(fn: () => Promise<ShareState>) {
    setBusy(true);
    setError(null);
    try {
      setState(await fn());
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function addUser(e: FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    run(() => api<ShareState>(base, { method: "POST", body: { email, role } })).then(() => setEmail(""));
  }

  const linkUrl = state?.link ? `${window.location.origin}/s/${state.link.token}` : null;

  async function copyLink() {
    if (!linkUrl) return;
    await navigator.clipboard.writeText(linkUrl);
    toast("Link copied");
  }

  return (
    <>
      <form onSubmit={addUser} className="flex gap-2">
        <TextInput
          type="email"
          placeholder="Add people by email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex-1"
        />
        <RoleSelect value={role} onChange={(r) => setRole(r as "VIEWER" | "EDITOR")} />
        <Button type="submit" disabled={busy || !email.trim()}>
          Add
        </Button>
      </form>
      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      <h3 className="eyebrow mt-6 mb-2">People with access</h3>
      <ul className="divide-y divide-border rounded-md border border-border bg-background">
        <li className="flex items-center gap-3 px-3 py-2 text-sm">
          <Avatar name={node.ownerName ?? "You"} />
          <div className="flex-1 min-w-0">
            <div className="truncate">{node.ownerName ?? "You"}</div>
          </div>
          <span className="text-muted">Owner</span>
        </li>
        {state?.users.map((u) => (
          <li key={u.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <Avatar name={u.name} />
            <div className="flex-1 min-w-0">
              <div className="truncate">{u.name}</div>
              <div className="truncate text-xs text-muted">{u.email}</div>
            </div>
            <RoleSelect
              value={u.role}
              onChange={(r) => run(() => api<ShareState>(base, { method: "POST", body: { email: u.email, role: r } }))}
            />
            <button
              onClick={() => run(() => api<ShareState>(`${base}?shareId=${u.id}`, { method: "DELETE" }))}
              className="rounded-md p-1.5 text-muted hover:bg-hover hover:text-foreground"
              aria-label={`Remove ${u.name}`}
            >
              <X size={16} />
            </button>
          </li>
        ))}
        {state && state.users.length === 0 && <li className="px-3 py-2 text-sm text-muted">Not shared with anyone yet</li>}
      </ul>

      <h3 className="eyebrow mt-6 mb-2">General access</h3>
      <div className="flex items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-sm">
        <div className={`rounded-md p-2 ${state?.link ? "bg-primary-soft text-primary" : "bg-surface-2 text-muted"}`}>
          {state?.link ? <Globe size={18} /> : <Lock size={18} />}
        </div>
        <div className="flex-1">
          <select
            value={state?.link ? "anyone" : "restricted"}
            disabled={!state || busy}
            onChange={(e) =>
              run(() => api<ShareState>(base, { method: "PUT", body: { enabled: e.target.value === "anyone", role: state?.link?.role ?? "VIEWER" } }))
            }
            className="rounded-md bg-transparent py-1 pr-6 font-medium hover:bg-hover"
          >
            <option value="restricted">Restricted</option>
            <option value="anyone">Anyone with the link</option>
          </select>
          <div className="text-xs text-muted">
            {state?.link ? "Anyone on the internet with the link can " + (state.link.role === "EDITOR" ? "edit" : "view") : "Only people with access can open with the link"}
          </div>
        </div>
        {state?.link && (
          <RoleSelect
            value={state.link.role}
            onChange={(r) => run(() => api<ShareState>(base, { method: "PUT", body: { enabled: true, role: r } }))}
          />
        )}
      </div>

      <div className="flex justify-between pt-5">
        <Button variant="outline" onClick={copyLink} disabled={!linkUrl} className="flex items-center gap-2">
          <Link2 size={16} /> Copy link
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    </>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (r: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-border bg-background px-2 py-2 text-sm"
    >
      <option value="VIEWER">Viewer</option>
      <option value="EDITOR">Editor</option>
    </select>
  );
}

export function Avatar({ name, image, size = 32 }: { name: string; image?: string | null; size?: number }) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 0);
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" referrerPolicy="no-referrer" className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-medium text-background"
      style={{ width: size, height: size, fontSize: size * 0.45, background: `hsl(${hue} 55% 45%)` }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase()}
    </div>
  );
}
