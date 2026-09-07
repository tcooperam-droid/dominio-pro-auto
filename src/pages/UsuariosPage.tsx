import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getSession } from "@/lib/access";
import type { AuthorizedRole, AuthorizedUser } from "@/lib/authConfig";

const roles: Array<{ value: AuthorizedRole; label: string }> = [
  { value: "manager", label: "Gerente" },
  { value: "employee", label: "Funcionário" },
];

export default function UsuariosPage() {
  const session = getSession();
  const [users, setUsers] = useState<AuthorizedUser[]>([]);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState<AuthorizedRole>("employee");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  async function loadUsers() {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from("authorized_users")
      .select("id, email, display_name, role, active")
      .order("created_at", { ascending: true });
    if (loadError) setError(loadError.message);
    else setUsers((data ?? []) as AuthorizedUser[]);
    setLoading(false);
  }

  useEffect(() => { void loadUsers(); }, []);

  async function addUser(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const normalized = email.trim().toLowerCase();
    if (!normalized || !normalized.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }
    const { error: insertError } = await supabase.from("authorized_users").insert({
      email: normalized,
      display_name: displayName.trim() || normalized,
      role,
      active: true,
    });
    if (insertError) setError(insertError.message);
    else {
      setEmail("");
      setDisplayName("");
      setRole("employee");
      await loadUsers();
    }
  }

  async function updateUser(user: AuthorizedUser, patch: Partial<AuthorizedUser>) {
    setError("");
    const { error: updateError } = await supabase.from("authorized_users").update(patch).eq("id", user.id);
    if (updateError) setError(updateError.message);
    else await loadUsers();
  }

  async function removeUser(user: AuthorizedUser) {
    if (user.role === "owner") return;
    await updateUser(user, { active: false });
  }

  if (session?.role !== "owner") {
    return <div className="p-8 text-sm text-muted-foreground">Apenas o proprietário pode gerenciar usuários.</div>;
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">Usuários e permissões</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cada pessoa usa o próprio e-mail e recebe seu código temporário.</p>
      </div>
      <form onSubmit={addUser} className="grid gap-3 rounded-xl border border-border bg-card/50 p-4 md:grid-cols-[1fr_1fr_180px_auto]">
        <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="E-mail do usuário" type="email" value={email} onChange={event => setEmail(event.target.value)} />
        <input className="rounded-lg border border-border bg-background px-3 py-2 text-sm" placeholder="Nome exibido" value={displayName} onChange={event => setDisplayName(event.target.value)} />
        <select className="rounded-lg border border-border bg-background px-3 py-2 text-sm" value={role} onChange={event => setRole(event.target.value as AuthorizedRole)}>
          {roles.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
        <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" type="submit">Adicionar</button>
      </form>
      {error && <p className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border bg-card"><tr><th className="p-3">Nome</th><th className="p-3">E-mail</th><th className="p-3">Perfil</th><th className="p-3">Status</th><th className="p-3">Ação</th></tr></thead>
          <tbody>
            {loading ? <tr><td className="p-4" colSpan={5}>Carregando...</td></tr> : users.map(user => (
              <tr className="border-b border-border last:border-0" key={user.id}>
                <td className="p-3">{user.display_name}</td><td className="p-3">{user.email}</td>
                <td className="p-3">{user.role === "owner" ? "Proprietário" : user.role === "manager" ? "Gerente" : "Funcionário"}</td>
                <td className="p-3">{user.active ? "Ativo" : "Bloqueado"}</td>
                <td className="p-3">{user.role === "owner" ? <span className="text-xs text-muted-foreground">Protegido</span> : <button className="text-xs text-primary underline" onClick={() => void (user.active ? removeUser(user) : updateUser(user, { active: true }))}>{user.active ? "Bloquear" : "Reativar"}</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
