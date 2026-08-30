/**
 * FerramentasClientesPage — Importar cadastro de clientes, detectar e mesclar duplicados.
 * Design: Glass Dashboard — tema escuro, accent rosa, backdrop-blur.
 */
import { useState, useMemo, useRef, useCallback } from "react";
import { useStoreVersion } from "@/hooks/useStoreVersion";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Upload, Users, Merge, CheckCircle, AlertTriangle, FileSpreadsheet,
  Trash2, RefreshCw, ChevronDown, ChevronUp, Smartphone, Phone,
} from "lucide-react";
import { clientsStore, type Client } from "@/features/clientes";
import { appointmentsStore } from "@/features/agenda";
import * as XLSX from "xlsx";

// ─── Helpers ────────────────────────────────────────────────

/** Normaliza nome para comparação: remove acentos, espaços extras e caracteres invisíveis */
function normalizeName(name: string): string {
  if (!name) return "";
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove acentos
    .toLowerCase()
    .replace(/[^\w\s]/gi, "") // Remove caracteres especiais (pontuação)
    .replace(/\s+/g, " ")     // Normaliza espaços internos
    .trim();
}

function normalizePhone(phone: string | null): string {
  return (phone || "").replace(/\D/g, "");
}

function nameSimilarity(a: string, b: string): number {
  const left = normalizeName(a);
  const right = normalizeName(b);
  if (!left || !right) return 0;
  const matrix = Array.from({ length: left.length + 1 }, (_, i) => Array.from({ length: right.length + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0));
  for (let i = 1; i <= left.length; i++) for (let j = 1; j <= right.length; j++) {
    matrix[i][j] = left[i - 1] === right[j - 1]
      ? matrix[i - 1][j - 1]
      : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
  }
  return 1 - matrix[left.length][right.length] / Math.max(left.length, right.length);
}

function mergeProbability(a: Client, b: Client): { label: string; score: number; reason: string } | null {
  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  const samePhone = phoneA.length >= 8 && phoneB.length >= 8 && phoneA.slice(-8) === phoneB.slice(-8) && new Set(phoneA).size > 2;
  const nameScore = nameSimilarity(a.name, b.name);
  if (samePhone && nameScore >= 0.72) return { label: "Muito alta", score: 98, reason: "Telefone coincidente e nome semelhante" };
  if (samePhone) return { label: "Alta", score: 90, reason: "Telefone coincidente" };
  if (nameScore >= 0.92) return { label: "Média", score: Math.round(nameScore * 100), reason: "Nome muito semelhante" };
  return null;
}

interface PossibleMergePair { left: Client; right: Client; probability: { label: string; score: number; reason: string } }

function findPossibleMergePairs(clients: Client[]): PossibleMergePair[] {
  // Bloqueia candidatos por telefone ou partes do nome. Comparar todos os
  // pares de 1.700+ clientes custaria milhões de comparações e travaria o
  // celular antes da tela conseguir renderizar.
  const buckets = new Map<string, number[]>();
  const addToBucket = (key: string, index: number) => {
    if (!key) return;
    const list = buckets.get(key) ?? [];
    list.push(index);
    buckets.set(key, list);
  };
  clients.forEach((client, index) => {
    const normalized = normalizeName(client.name);
    const tokens = normalized.split(" ").filter(Boolean);
    const phone = normalizePhone(client.phone);
    if (phone.length >= 8 && new Set(phone).size > 2) addToBucket(`phone:${phone.slice(-8)}`, index);
    const first = tokens[0] ?? "";
    const last = tokens[tokens.length - 1] ?? first;
    addToBucket(`name:${first.slice(0, 4)}:${last.slice(0, 4)}`, index);
    addToBucket(`first:${first.slice(0, 5)}`, index);
  });
  const pairKeys = new Set<string>();
  const pairs: PossibleMergePair[] = [];
  for (const indexes of buckets.values()) {
    for (let i = 0; i < indexes.length; i++) for (let j = i + 1; j < indexes.length; j++) {
      const leftIndex = Math.min(indexes[i], indexes[j]);
      const rightIndex = Math.max(indexes[i], indexes[j]);
      const key = `${leftIndex}:${rightIndex}`;
      if (pairKeys.has(key)) continue;
      pairKeys.add(key);
      const probability = mergeProbability(clients[leftIndex], clients[rightIndex]);
      if (probability) pairs.push({ left: clients[leftIndex], right: clients[rightIndex], probability });
    }
  }
  return pairs.sort((a, b) => b.probability.score - a.probability.score);
}

/** Agrupa clientes por nome normalizado */
function findDuplicateGroups(clients: Client[]): Map<string, Client[]> {
  const groups = new Map<string, Client[]>();
  clients.forEach(client => {
    const key = normalizeName(client.name);
    if (!key) return;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(client);
  });
  
  const duplicates = new Map<string, Client[]>();
  groups.forEach((group, key) => {
    if (group.length > 1) duplicates.set(key, group);
  });
  return duplicates;
}

/** Mescla um grupo de clientes duplicados de forma segura */
function mergeClientGroup(group: Client[]): { keep: Client; removeIds: number[] } {
  // Ordena por data de criação (mais antigo primeiro para ser o master)
  const sorted = [...group].sort((a, b) => 
    new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  
  // Clone profundo para não afetar o objeto original no store prematuramente
  const keep = JSON.parse(JSON.stringify(sorted[0])) as Client;
  const removeIds: number[] = [];

  sorted.slice(1).forEach(other => {
    if (!keep.email && other.email) keep.email = other.email;
    if (!keep.phone && other.phone) keep.phone = other.phone;
    if (!keep.birthDate && other.birthDate) keep.birthDate = other.birthDate;
    if (!keep.cpf && other.cpf) keep.cpf = other.cpf;
    if (!keep.address && other.address) keep.address = other.address;
    
    if (other.notes) {
      if (!keep.notes) {
        keep.notes = other.notes;
      } else if (!keep.notes.includes(other.notes)) {
        // Evita duplicar a mesma nota se forem idênticas
        keep.notes = `${keep.notes} | ${other.notes}`;
      }
    }
    removeIds.push(other.id);
  });

  return { keep, removeIds };
}

/** Parse CSV simples */
function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(/[,;\t]/).map(h => h.trim().replace(/^"|"$/g, "").toLowerCase());
  return lines.slice(1).map(line => {
    const values: string[] = [];
    let current = "";
    let inQuotes = false;
    for (const char of line) {
      if (char === '"') { inQuotes = !inQuotes; continue; }
      if ((char === "," || char === ";" || char === "\t") && !inQuotes) {
        values.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }
    values.push(current.trim());
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ""; });
    return obj;
  });
}

function mapToClient(row: Record<string, string>): Omit<Client, "id" | "createdAt"> | null {
  const name = row["nome"] || row["name"] || row["cliente"] || row["client"] || row["nome completo"] || row["full name"] || "";
  if (!name.trim()) return null;
  return {
    name:      name.trim(),
    email:     (row["email"] || row["e-mail"] || row["e_mail"] || "").trim() || null,
    phone:     (row["telefone"] || row["phone"] || row["celular"] || row["tel"] || row["whatsapp"] || "").trim() || null,
    birthDate: (row["nascimento"] || row["data_nascimento"] || row["birth_date"] || row["birthdate"] || "").trim() || null,
    cpf:       (row["cpf"] || row["cpf/cnpj"] || row["documento"] || "").trim() || null,
    address:   (row["endereço"] || row["endereco"] || row["address"] || "").trim() || null,
    notes:     (row["observacao"] || row["observações"] || row["obs"] || row["notes"] || "").trim() || null,
  };
}

function parseVCF(text: string): Omit<Client, "id" | "createdAt">[] {
  const clients: Omit<Client, "id" | "createdAt">[] = [];
  const cards = text.split(/BEGIN:VCARD/i).slice(1);

  cards.forEach(card => {
    const lines: string[] = [];
    card.split(/\r?\n/).forEach(line => {
      if (/^[ 	]/.test(line) && lines.length > 0) {
        lines[lines.length - 1] += line.trimStart();
      } else {
        lines.push(line);
      }
    });

    let name = "", phone = "", email = "", address = "";

    lines.forEach(line => {
      const [rawKey, ...rest] = line.split(":");
      const value = rest.join(":").trim();
      if (!value) return;
      const key = rawKey.toUpperCase();

      if (key === "FN" || key.startsWith("FN;")) {
        name = value;
      } else if ((key === "N" || key.startsWith("N;")) && !name) {
        const parts = value.split(";").map(p => p.trim()).filter(Boolean);
        name = parts.length >= 2 ? `${parts[1]} ${parts[0]}`.trim() : parts[0] ?? "";
      }
      if ((key.startsWith("TEL") || key === "TEL") && !phone) {
        phone = value.replace(/[^\d+\-() ]/g, "").trim();
      }
      if ((key.startsWith("EMAIL") || key === "EMAIL") && !email) {
        email = value;
      }
      if ((key.startsWith("ADR") || key === "ADR") && !address) {
        address = value.split(";").map(p => p.trim()).filter(Boolean).join(", ");
      }
    });

    if (name.trim()) {
      clients.push({ name: name.trim(), phone: phone || null, email: email || null, address: address || null, birthDate: null, cpf: null, notes: null });
    }
  });
  return clients;
}

// ─── Componente Principal ───────────────────────────────────

export default function FerramentasClientesPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [importPreview, setImportPreview] = useState<Omit<Client, "id" | "createdAt">[]>([]);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [mergeAllOpen, setMergeAllOpen] = useState(false);
  const [merging, setMerging] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [selectedGroups, setSelectedGroups] = useState<Set<string>>(new Set());
  const [mergeDetailGroup, setMergeDetailGroup] = useState<string | null>(null);
  const [mergeSuggestedPair, setMergeSuggestedPair] = useState<PossibleMergePair | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const vcfInputRef  = useRef<HTMLInputElement>(null);
  const storeVersion = useStoreVersion();

  const clients = useMemo(() => clientsStore.list(), [refreshKey, storeVersion]);
  const duplicateGroups = useMemo(() => findDuplicateGroups(clients), [clients]);
  const duplicateGroupsArray = useMemo(() => Array.from(duplicateGroups.entries()), [duplicateGroups]);
  const possibleMergePairs = useMemo(() => findPossibleMergePairs(clients), [clients]);

  const refresh = () => setRefreshKey(k => k + 1);

  // ─── Importação ─────────────────────────────────────────

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const processRows = (rows: Record<string, string>[]) => {
      const parsed = rows.map(row => mapToClient(row)).filter(Boolean) as Omit<Client, "id" | "createdAt">[];
      if (parsed.length === 0) {
        toast.error("Nenhum cliente válido encontrado.");
        return;
      }
      setImportPreview(parsed);
      setImportModalOpen(true);
    };

    const reader = new FileReader();
    if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
      reader.onload = (ev) => {
        try {
          const data = new Uint8Array(ev.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: "array" });
          const rows: any[] = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval: "" });
          const normalized = rows.map(row => Object.fromEntries(Object.entries(row).map(([k, v]) => [k.toLowerCase().trim(), String(v).trim()])));
          processRows(normalized);
        } catch { toast.error("Erro ao ler Excel."); }
      };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = (ev) => {
        try {
          const text = ev.target?.result as string;
          if (file.name.endsWith(".json")) {
            const json = JSON.parse(text);
            const arr = Array.isArray(json) ? json : (json.clients || []);
            processRows(arr);
          } else {
            processRows(parseCSV(text));
          }
        } catch { toast.error("Erro ao ler arquivo."); }
      };
      reader.readAsText(file);
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleVCFSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev): void => {
      try {
        const parsed = parseVCF(ev.target?.result as string);
        if (parsed.length === 0) {
          toast.error("Nenhum contato VCF encontrado.");
          return;
        }
        setImportPreview(parsed);
        setImportModalOpen(true);
      } catch { toast.error("Erro no VCF."); }
    };
    reader.readAsText(file, "UTF-8");
    if (vcfInputRef.current) vcfInputRef.current.value = "";
  }, []);

  const handleImportConfirm = async () => {
    setImporting(true);
    try {
      await clientsStore.createMany(importPreview);
      toast.success(`${importPreview.length} cliente(s) importado(s).`);
      setImportModalOpen(false);
      refresh();
    } catch (err) { toast.error("Erro na importação."); }
    finally { setImporting(false); }
  };

  // ─── Lógica de Mesclagem Corrigida ────────────────────────

  const executeMergeClients = async (group: Client[]) => {
    const { keep, removeIds } = mergeClientGroup(group);

    // 1. Reatribuir agendamentos primeiro (Evita órfãos)
    const allAppts = appointmentsStore.list({});
    const apptsToUpdate = allAppts.filter(a => a.clientId != null && removeIds.includes(a.clientId));
    
    await Promise.all(apptsToUpdate.map(a => 
      appointmentsStore.update(a.id, { clientId: keep.id, clientName: keep.name })
    ));

    // 2. Atualizar o cadastro master com os dados combinados
    await clientsStore.update(keep.id, {
      email: keep.email, phone: keep.phone, birthDate: keep.birthDate,
      cpf: keep.cpf, address: keep.address, notes: keep.notes
    });

    // 3. Remover as duplicatas
    await Promise.all(removeIds.map(id => clientsStore.delete(id)));
  };

  const executeMerge = async (key: string) => {
    const group = duplicateGroups.get(key);
    if (group) await executeMergeClients(group);
  };

  const handleMergeSuggestedPair = async () => {
    if (!mergeSuggestedPair) return;
    try {
      await executeMergeClients([mergeSuggestedPair.left, mergeSuggestedPair.right]);
      toast.success("Clientes mesclados com sucesso.");
      setMergeSuggestedPair(null);
      refresh();
    } catch { toast.error("Erro ao mesclar os clientes sugeridos."); }
  };

  const handleMergeGroup = async (key: string) => {
    try {
      await executeMerge(key);
      toast.success("Clientes mesclados com sucesso.");
      setMergeDetailGroup(null);
      refresh();
    } catch { toast.error("Erro ao mesclar."); }
  };

  const handleMergeAll = async () => {
    setMerging(true);
    try {
      const keys = selectedGroups.size > 0 
        ? Array.from(selectedGroups) 
        : duplicateGroupsArray.map(([k]) => k);

      for (const key of keys) {
        await executeMerge(key);
      }
      toast.success("Mesclagem em lote concluída.");
      setMergeAllOpen(false);
      setSelectedGroups(new Set());
      refresh();
    } catch { toast.error("Erro na mesclagem em lote."); }
    finally { setMerging(false); }
  };

  // ─── UI Helpers ──────────────────────────────────────────

  const toggleExpand = (key: string) => {
    const next = new Set(expandedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpandedGroups(next);
  };

  const toggleSelectGroup = (key: string) => {
    const next = new Set(selectedGroups);
    next.has(key) ? next.delete(key) : next.add(key);
    setSelectedGroups(next);
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <header>
        <h2 className="text-xl font-bold">Ferramentas de Clientes</h2>
        <p className="text-sm text-muted-foreground">Importação e limpeza de base de dados</p>
      </header>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card/50 border-border"><CardContent className="pt-5 flex items-center gap-3">
          <div className="p-2 bg-primary/20 rounded-lg text-primary"><Users className="w-5 h-5"/></div>
          <div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-bold">{clients.length}</p></div>
        </CardContent></Card>
        <Card className="bg-card/50 border-border"><CardContent className="pt-5 flex items-center gap-3">
          <div className="p-2 bg-amber-500/20 rounded-lg text-amber-400"><AlertTriangle className="w-5 h-5"/></div>
          <div><p className="text-xs text-muted-foreground">Grupos Duplos</p><p className="text-xl font-bold">{duplicateGroupsArray.length}</p></div>
        </CardContent></Card>
      </div>

      {/* Ações */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card/50 hover:border-primary/40 transition-all cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <CardContent className="pt-6 text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary"><Upload/></div>
            <h3 className="font-semibold">Importar Planilha</h3>
            <p className="text-xs text-muted-foreground">CSV ou Excel (XLSX)</p>
          </CardContent>
        </Card>

        <Card className="bg-card/50 hover:border-primary/40 transition-all cursor-pointer" onClick={() => vcfInputRef.current?.click()}>
          <CardContent className="pt-6 text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-primary/20 rounded-full flex items-center justify-center text-primary"><Smartphone/></div>
            <h3 className="font-semibold">Contatos do Celular</h3>
            <p className="text-xs text-muted-foreground">Arquivo .VCF</p>
          </CardContent>
        </Card>

        <Card className={`bg-card/50 transition-all ${duplicateGroupsArray.length ? 'hover:border-amber-500/40 cursor-pointer' : 'opacity-50'}`} onClick={() => duplicateGroupsArray.length && setMergeAllOpen(true)}>
          <CardContent className="pt-6 text-center space-y-2">
            <div className="mx-auto w-12 h-12 bg-amber-500/20 rounded-full flex items-center justify-center text-amber-400"><Merge/></div>
            <h3 className="font-semibold">Mesclar Tudo</h3>
            <p className="text-xs text-muted-foreground">Limpar duplicados</p>
          </CardContent>
        </Card>
      </div>

      {/* Possíveis mesclas por probabilidade */}
      {possibleMergePairs.length > 0 && (
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base flex items-center gap-2"><Users className="w-4 h-4 text-primary" /> Possíveis mesclas por probabilidade</CardTitle>
            <p className="text-xs text-muted-foreground">Sugestões para conferência. Nenhum cliente será alterado automaticamente.</p>
          </CardHeader>
          <CardContent className="p-0">
            {possibleMergePairs.map(({ left, right, probability }) => (
              <div key={`${left.id}-${right.id}`} className="border-b last:border-0 border-border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2"><Badge variant={probability.label === "Muito alta" ? "destructive" : "secondary"}>{probability.label}</Badge><span className="text-xs text-muted-foreground">{probability.score}% de probabilidade</span></div>
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">{probability.reason}</span><Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setMergeSuggestedPair({ left, right, probability })}><Merge className="w-3 h-3" /> Revisar e mesclar</Button></div>
                </div>
                <div className="grid gap-2 md:grid-cols-2">
                  {[left, right].map(client => <div key={client.id} className="rounded-lg bg-secondary/30 p-3"><p className="text-sm font-medium">#{client.id} — {client.name}</p><p className="text-xs text-muted-foreground">Telefone: {client.phone || "não informado"} · E-mail: {client.email || "não informado"}</p></div>)}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Lista de Duplicados */}
      {duplicateGroupsArray.length > 0 && (
        <Card className="border-border bg-card/50">
          <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              Potenciais Duplicatas
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setSelectedGroups(selectedGroups.size === duplicateGroupsArray.length ? new Set() : new Set(duplicateGroupsArray.map(([k]) => k)))}>
              {selectedGroups.size === duplicateGroupsArray.length ? "Desmarcar" : "Marcar todos"}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {duplicateGroupsArray.map(([key, group]) => (
              <div key={key} className="border-b last:border-0 border-border">
                <div className="flex items-center gap-4 p-4 hover:bg-secondary/20 transition-colors">
                  <Checkbox checked={selectedGroups.has(key)} onCheckedChange={() => toggleSelectGroup(key)} />
                  <div className="flex-1 cursor-pointer" onClick={() => toggleExpand(key)}>
                    <p className="text-sm font-semibold">{group[0].name}</p>
                    <p className="text-xs text-muted-foreground">{group.length} cadastros similares</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" className="h-8 gap-1" onClick={() => setMergeDetailGroup(key)}>
                      <Merge className="w-3 h-3"/> Mesclar
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => toggleExpand(key)}>
                      {expandedGroups.has(key) ? <ChevronUp/> : <ChevronDown/>}
                    </Button>
                  </div>
                </div>
                {expandedGroups.has(key) && (
                  <div className="px-12 pb-4 space-y-2">
                    {group.map((c, i) => (
                      <div key={c.id} className="text-xs p-2 rounded bg-secondary/30 flex justify-between">
                        <span>{i === 0 ? "⭐ (Master)" : `#${i+1}`} — {c.phone || 'Sem fone'} — {c.email || 'Sem email'}</span>
                        <span className="text-muted-foreground">Criado em: {new Date(c.createdAt).toLocaleDateString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Inputs Ocultos */}
      <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls,.json" className="hidden" onChange={handleFileSelect} />
      <input ref={vcfInputRef} type="file" accept=".vcf" className="hidden" onChange={handleVCFSelect} />

      {/* Modais de Confirmação */}
      <Dialog open={importModalOpen} onOpenChange={setImportModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Confirmar Importação</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Deseja importar {importPreview.length} clientes para o sistema?</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleImportConfirm} disabled={importing}>
              {importing ? <RefreshCw className="animate-spin mr-2"/> : <Upload className="mr-2"/>} Importar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={mergeAllOpen} onOpenChange={setMergeAllOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Mesclar em Lote</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            O sistema irá consolidar {selectedGroups.size || duplicateGroupsArray.length} grupos. 
            Agendamentos serão movidos para o cadastro mais antigo de cada grupo.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeAllOpen(false)}>Cancelar</Button>
            <Button onClick={handleMergeAll} disabled={merging} className="bg-amber-600 hover:bg-amber-700">
              {merging ? <RefreshCw className="animate-spin mr-2"/> : <Merge className="mr-2"/>} Confirmar Limpeza
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Modal Mesclagem de Sugestão */}
      <Dialog open={!!mergeSuggestedPair} onOpenChange={() => setMergeSuggestedPair(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Revisar possível mescla</DialogTitle></DialogHeader>
          {mergeSuggestedPair && <>
            <p className="text-sm text-muted-foreground">Probabilidade {mergeSuggestedPair.probability.score}% ({mergeSuggestedPair.probability.reason}). O cadastro mais antigo será mantido, os agendamentos serão transferidos e o outro cadastro será excluído. Esta ação não pode ser desfeita.</p>
            <div className="space-y-2 rounded-lg bg-secondary/30 p-3 text-sm"><p><strong>Será mantido:</strong> #{[mergeSuggestedPair.left, mergeSuggestedPair.right].sort((a,b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())[0].id}</p><p>{mergeSuggestedPair.left.name} / {mergeSuggestedPair.right.name}</p></div>
          </>}
          <DialogFooter><Button variant="outline" onClick={() => setMergeSuggestedPair(null)}>Cancelar</Button><Button onClick={handleMergeSuggestedPair} className="bg-amber-600 hover:bg-amber-700"><Merge className="mr-2" />Confirmar mesclagem</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal Mesclagem Individual */}
      <Dialog open={!!mergeDetailGroup} onOpenChange={() => setMergeDetailGroup(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Consolidar Cadastro</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            As informações de contato e notas serão combinadas no registro mais antigo. Esta ação não pode ser desfeita.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMergeDetailGroup(null)}>Cancelar</Button>
            <Button onClick={() => mergeDetailGroup && handleMergeGroup(mergeDetailGroup)}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
