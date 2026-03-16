/**
 * BackupPage — Exportar e importar dados em JSON, limpar dados.
 * Usa Supabase via store (não localStorage).
 */
import { useState, useRef, useEffect } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Database, Download, Upload, Trash2, CheckCircle, RefreshCw,
} from "lucide-react";
import {
  employeesStore, servicesStore, clientsStore, appointmentsStore,
  cashSessionsStore, cashEntriesStore, auditStore,
  fetchAllData,
} from "@/lib/store";
import { supabase } from "@/lib/supabase";

export default function BackupPage() {
  const [clearOpen, setClearOpen] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [summary, setSummary] = useState([
    { label: "Funcionários", count: 0 },
    { label: "Serviços", count: 0 },
    { label: "Clientes", count: 0 },
    { label: "Agendamentos", count: 0 },
    { label: "Sessões de Caixa", count: 0 },
    { label: "Logs de Auditoria", count: 0 },
  ]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const refreshSummary = () => {
    setSummary([
      { label: "Funcionários", count: employeesStore.list().length },
      { label: "Serviços", count: servicesStore.list().length },
      { label: "Clientes", count: clientsStore.list().length },
      { label: "Agendamentos", count: appointmentsStore.list().length },
      { label: "Sessões de Caixa", count: cashSessionsStore.list().length },
      { label: "Logs de Auditoria", count: auditStore.log().length },
    ]);
  };

  useEffect(() => {
    fetchAllData().then(refreshSummary);
  }, []);

  const totalRecords = summary.reduce((sum, s) => sum + s.count, 0);

  const exportData = async () => {
    setExporting(true);
    try {
      await fetchAllData();
      const data = {
        exportedAt: new Date().toISOString(),
        version: "supabase-v1",
        employees: employeesStore.list(),
        services: servicesStore.list(),
        clients: clientsStore.list(),
        appointments: appointmentsStore.list(),
        cashSessions: cashSessionsStore.list(),
        cashEntries: cashEntriesStore.list(),
        auditLogs: auditStore.log(),
      };
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `salao-bella-backup-${format(new Date(), "yyyy-MM-dd-HHmm")}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Backup exportado com sucesso!");
    } catch {
      toast.error("Erro ao exportar backup");
    } finally {
      setExporting(false);
    }
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      setImporting(true);
      try {
        const data = JSON.parse(ev.target?.result as string);
        if (typeof data !== "object") throw new Error("Formato inválido");

        if (data.version !== "supabase-v1") {
          toast.error("Formato de backup não reconhecido. Use um backup exportado por esta versão do app.");
          return;
        }

        if (Array.isArray(data.employees)) {
          for (const e of data.employees) {
            await employeesStore.create({
              name: e.name, email: e.email ?? "", phone: e.phone ?? "",
              color: e.color ?? "#ec4899", specialties: e.specialties ?? [],
              commissionPercent: e.commissionPercent ?? 0,
              workingHours: e.workingHours ?? {}, active: e.active ?? true,
            });
          }
        }
        if (Array.isArray(data.services)) {
          for (const s of data.services) {
            await servicesStore.create({
              name: s.name, description: s.description ?? null,
              durationMinutes: s.durationMinutes ?? 60, price: s.price ?? 0,
              color: s.color ?? "#ec4899", active: s.active ?? true,
            });
          }
        }
        if (Array.isArray(data.clients)) {
          for (const c of data.clients) {
            await clientsStore.create({
              name: c.name, email: c.email ?? null, phone: c.phone ?? null,
              birthDate: c.birthDate ?? null, cpf: c.cpf ?? null,
              address: c.address ?? null, notes: c.notes ?? null,
            });
          }
        }
        await fetchAllData();
        refreshSummary();
        toast.success("Backup importado com sucesso!");
      } catch (err: any) {
        toast.error(err?.message ?? "Arquivo de backup inválido");
      } finally {
        setImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const clearAllData = async () => {
    setClearing(true);
    try {
      await supabase.from("audit_logs").delete().neq("id", 0);
      await supabase.from("cash_entries").delete().neq("id", 0);
      await supabase.from("cash_sessions").delete().neq("id", 0);
      await supabase.from("appointments").delete().neq("id", 0);
      await supabase.from("clients").delete().neq("id", 0);
      await supabase.from("services").delete().neq("id", 0);
      await supabase.from("employees").delete().neq("id", 0);
      await fetchAllData();
      refreshSummary();
      toast.success("Todos os dados foram removidos!");
      setClearOpen(false);
    } catch {
      toast.error("Erro ao limpar dados");
    } finally {
      setClearing(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold">Backup & Dados</h2>
        <p className="text-sm text-muted-foreground">Exportar, importar e gerenciar dados do sistema</p>
      </div>

      {/* Summary */}
      <Card className="border-border bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Database className="w-4 h-4 text-primary" />Resumo dos Dados
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {summary.map(s => (
              <div key={s.label} className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 border border-border">
                <span className="text-sm">{s.label}</span>
                <Badge variant="secondary" className="text-xs">{s.count}</Badge>
              </div>
            ))}
          </div>
          <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle className="w-4 h-4 text-emerald-400" />
            <span>Total: <strong className="text-foreground">{totalRecords}</strong> registros no banco de dados</span>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-border bg-card/50 hover:border-primary/30 transition-colors cursor-pointer" onClick={exportData}>
          <CardContent className="pt-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-primary/20 flex items-center justify-center mx-auto">
              {exporting ? <RefreshCw className="w-6 h-6 text-primary animate-spin" /> : <Download className="w-6 h-6 text-primary" />}
            </div>
            <h3 className="font-semibold">Exportar Backup</h3>
            <p className="text-xs text-muted-foreground">Baixar todos os dados em formato JSON</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 hover:border-blue-500/30 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
          <CardContent className="pt-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center mx-auto">
              {importing ? <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" /> : <Upload className="w-6 h-6 text-blue-400" />}
            </div>
            <h3 className="font-semibold">Importar Backup</h3>
            <p className="text-xs text-muted-foreground">Restaurar dados de um arquivo JSON</p>
          </CardContent>
        </Card>

        <Card className="border-border bg-card/50 hover:border-red-500/30 transition-colors cursor-pointer" onClick={() => setClearOpen(true)}>
          <CardContent className="pt-6 text-center space-y-3">
            <div className="w-12 h-12 rounded-xl bg-red-500/20 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6 text-red-400" />
            </div>
            <h3 className="font-semibold">Limpar Dados</h3>
            <p className="text-xs text-muted-foreground">Remover todos os dados do sistema</p>
          </CardContent>
        </Card>
      </div>

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={importData} />

      {/* Info */}
      <Card className="border-emerald-500/30 bg-emerald-500/5">
        <CardContent className="pt-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-emerald-400">Banco de Dados na Nuvem</p>
              <p className="text-xs text-muted-foreground mt-1">
                Os dados são armazenados no Supabase (nuvem). Acessíveis de qualquer dispositivo.
                Faça backups regulares em JSON para ter uma cópia local de segurança.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Clear confirmation */}
      <Dialog open={clearOpen} onOpenChange={v => !v && setClearOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Limpar todos os dados?</DialogTitle></DialogHeader>
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-4">
              Esta ação vai remover <strong className="text-foreground">{totalRecords} registros</strong> permanentemente do banco de dados.
            </p>
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
              <p className="text-sm text-destructive">Atenção: esta ação não pode ser desfeita. Faça um backup antes.</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClearOpen(false)} disabled={clearing}>Cancelar</Button>
            <Button variant="destructive" onClick={clearAllData} disabled={clearing} className="gap-2">
              {clearing ? <><RefreshCw className="w-4 h-4 animate-spin" />Limpando...</> : <><Trash2 className="w-4 h-4" />Limpar Tudo</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
