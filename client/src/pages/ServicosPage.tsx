/**
 * ServicosPage — CRUD de serviços do salão.
 */
import { useState, useMemo } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, Scissors, Clock, DollarSign } from "lucide-react";
import { servicesStore, type Service } from "@/lib/store";

const COLORS = ["#ec4899", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#84cc16", "#f97316", "#6366f1"];

interface ServiceForm {
  name: string; description: string; durationMinutes: number;
  price: string; color: string; active: boolean;
}

const defaultForm = (): ServiceForm => ({
  name: "", description: "", durationMinutes: 60, price: "", color: COLORS[0], active: true,
});

export default function ServicosPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<ServiceForm>(defaultForm());
  const [loading, setLoading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const services = useMemo(() => servicesStore.list(false), [refreshKey]);

  const openCreate = () => { setEditingId(null); setForm(defaultForm()); setModalOpen(true); };

  const openEdit = (svc: Service) => {
    setEditingId(svc.id);
    setForm({
      name: svc.name, description: svc.description ?? "",
      durationMinutes: svc.durationMinutes,
      price: String(svc.price.toFixed(2)), color: svc.color, active: svc.active,
    });
    setModalOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    if (!form.price || isNaN(parseFloat(form.price))) { toast.error("Preço inválido"); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(), description: form.description || null,
        durationMinutes: form.durationMinutes, price: parseFloat(form.price),
        color: form.color, active: form.active,
      };
      if (editingId) {
        await servicesStore.update(editingId, payload);
        toast.success("Serviço atualizado!");
      } else {
        await servicesStore.create(payload);
        toast.success("Serviço cadastrado!");
      }
      setModalOpen(false);
      setRefreshKey(k => k + 1);
    } catch { toast.error("Erro ao salvar"); } finally { setLoading(false); }
  };

  const handleDeactivate = async (svc: Service) => {
    if (!confirm(`Desativar "${svc.name}"?`)) return;
    try {
      await servicesStore.update(svc.id, { active: false });
      toast.success("Serviço desativado");
      setRefreshKey(k => k + 1);
    } catch { toast.error("Erro ao desativar serviço"); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Serviços</h2>
          <p className="text-sm text-muted-foreground">{services.filter(s => s.active).length} ativos</p>
        </div>
        <Button onClick={openCreate} className="gap-2 text-xs">
          <Plus className="w-3.5 h-3.5" />Novo Serviço
        </Button>
      </div>

      {services.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Scissors className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhum serviço cadastrado</p>
          <p className="text-sm mt-1">Clique em "Novo Serviço" para começar</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {services.map(svc => (
            <Card key={svc.id} className={`border-border bg-card/50 overflow-hidden ${!svc.active ? "opacity-50" : ""}`}>
              <div className="h-1.5" style={{ backgroundColor: svc.color }} />
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: svc.color }} />
                    <h3 className="font-semibold text-sm">{svc.name}</h3>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(svc)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {svc.active && (
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => handleDeactivate(svc)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                {svc.description && <p className="text-xs text-muted-foreground">{svc.description}</p>}
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Clock className="w-3 h-3" />{svc.durationMinutes} min
                  </div>
                  <div className="flex items-center gap-1 text-sm font-bold text-primary">
                    <DollarSign className="w-3.5 h-3.5" />R$ {svc.price.toFixed(2)}
                  </div>
                  {!svc.active && <Badge variant="secondary" className="text-[10px] ml-auto">Inativo</Badge>}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal */}
      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editingId ? "Editar Serviço" : "Novo Serviço"}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Nome *</Label>
              <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome do serviço" />
            </div>
            <div className="space-y-1">
              <Label>Descrição</Label>
              <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Descrição do serviço" rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Duração (min)</Label>
                <Input type="number" min="5" step="5" value={form.durationMinutes} onChange={e => setForm(p => ({ ...p, durationMinutes: parseInt(e.target.value) || 60 }))} />
              </div>
              <div className="space-y-1">
                <Label>Preço (R$) *</Label>
                <Input type="number" min="0" step="0.01" value={form.price} onChange={e => setForm(p => ({ ...p, price: e.target.value }))} placeholder="0.00" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
            </div>
            {editingId && (
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
                <Label>Serviço ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
