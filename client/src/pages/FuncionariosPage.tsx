/**
 * FuncionariosPage — CRUD de funcionários com horários de trabalho.
 */
import { useState, useMemo, useRef, useEffect } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Plus, Pencil, Trash2, UserCheck, Phone, Mail, Percent, Camera, X as XIcon, Loader2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { employeesStore, type Employee } from "@/lib/store";
import { supabase } from "@/lib/supabase";

const COLORS = ["#ec4899", "#8b5cf6", "#06b6d4", "#10b981", "#f59e0b", "#ef4444", "#3b82f6", "#84cc16", "#f97316", "#6366f1"];
const DAYS = ["seg", "ter", "qua", "qui", "sex", "sab", "dom"];
const DAY_LABELS: Record<string, string> = { seg: "Seg", ter: "Ter", qua: "Qua", qui: "Qui", sex: "Sex", sab: "Sáb", dom: "Dom" };

type WorkingHours = Record<string, { start: string; end: string; active: boolean }>;

const defaultWorkingHours = (): WorkingHours =>
  Object.fromEntries(DAYS.map(d => [d, { start: "08:00", end: "18:00", active: !["sab", "dom"].includes(d) }]));

interface EmployeeFormData {
  name: string; email: string; phone: string; color: string;
  photoUrl: string;
  specialties: string; commissionPercent: string;
  workingHours: WorkingHours; active: boolean;
}

const defaultForm = (): EmployeeFormData => ({
  name: "", email: "", phone: "", color: COLORS[0],
  photoUrl: "",
  specialties: "", commissionPercent: "30",
  workingHours: defaultWorkingHours(), active: true,
});

export default function FuncionariosPage() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<EmployeeFormData>(defaultForm());
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const employees = useMemo(() => employeesStore.list(false), [refreshKey]);

  useEffect(() => {
    const onUpdate = () => setRefreshKey(k => k + 1);
    window.addEventListener("store_updated", onUpdate);
    return () => window.removeEventListener("store_updated", onUpdate);
  }, []);

  const openCreate = () => { setEditingId(null); setForm(defaultForm()); setModalOpen(true); };

  const openEdit = (emp: Employee) => {
    setEditingId(emp.id);
    setForm({
      name: emp.name, email: emp.email, phone: emp.phone, color: emp.color,
      photoUrl: emp.photoUrl ?? "",
      specialties: emp.specialties.join(", "),
      commissionPercent: String(emp.commissionPercent),
      workingHours: emp.workingHours ?? defaultWorkingHours(),
      active: emp.active,
    });
    setModalOpen(true);
  };

  const updateWH = (day: string, field: string, value: any) => {
    setForm(p => ({
      ...p,
      workingHours: { ...p.workingHours, [day]: { ...p.workingHours[day], [field]: value } },
    }));
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) { toast.error("Selecione uma imagem válida"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Imagem muito grande. Máximo 5MB."); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from("employee-photos")
        .upload(fileName, file, { upsert: false });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("employee-photos").getPublicUrl(fileName);
      setForm(p => ({ ...p, photoUrl: data.publicUrl }));
      toast.success("Foto enviada!");
    } catch (err: any) {
      toast.error("Erro ao enviar foto: " + (err.message ?? "tente novamente"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) { toast.error("Nome é obrigatório"); return; }
    setLoading(true);
    try {
      const payload = {
        name: form.name.trim(), email: form.email, phone: form.phone, color: form.color,
        photoUrl: form.photoUrl.trim() || null,
        specialties: form.specialties.split(",").map(s => s.trim()).filter(Boolean),
        commissionPercent: parseFloat(form.commissionPercent) || 0,
        workingHours: form.workingHours, active: form.active,
      };
      if (editingId) {
        await employeesStore.update(editingId, payload);
        toast.success("Funcionário atualizado!");
      } else {
        await employeesStore.create(payload);
        toast.success("Funcionário cadastrado!");
      }
      setModalOpen(false);
      setRefreshKey(k => k + 1);
    } catch { toast.error("Erro ao salvar"); } finally { setLoading(false); }
  };

  const handleDeactivate = async (emp: Employee) => {
    if (!confirm(`Desativar "${emp.name}"?`)) return;
    try {
      await employeesStore.update(emp.id, { active: false });
      toast.success("Funcionário desativado");
      setRefreshKey(k => k + 1);
    } catch { toast.error("Erro ao desativar funcionário"); }
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Funcionários</h2>
          <p className="text-sm text-muted-foreground">{employees.filter(e => e.active).length} ativos</p>
        </div>
        <Button onClick={openCreate} className="gap-2 text-xs">
          <Plus className="w-3.5 h-3.5" />Novo Funcionário
        </Button>
      </div>

      {employees.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <UserCheck className="w-12 h-12 mx-auto mb-4 opacity-30" />
          <p className="text-lg font-medium">Nenhum funcionário cadastrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {employees.map(emp => (
            <Card key={emp.id} className={`border-border bg-card/50 overflow-hidden ${!emp.active ? "opacity-50" : ""}`}>
              <div className="h-1.5" style={{ backgroundColor: emp.color }} />
              <CardHeader className="pb-2">
                <div className="flex items-center gap-3">
                  <Avatar className="w-10 h-10" style={{ boxShadow: `0 0 0 2px ${emp.color}55` }}>
                    {emp.photoUrl && <AvatarImage src={emp.photoUrl} alt={emp.name} />}
                    <AvatarFallback style={{ backgroundColor: emp.color, color: "#fff" }} className="font-bold text-sm">
                      {emp.name.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm truncate">{emp.name}</h3>
                      {!emp.active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                    </div>
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Percent className="w-3 h-3" />{emp.commissionPercent}% comissão
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(emp)}>
                      <Pencil className="w-3.5 h-3.5" />
                    </Button>
                    {emp.active && (
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-destructive hover:text-destructive" onClick={() => handleDeactivate(emp)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {emp.phone && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Phone className="w-3 h-3" />{emp.phone}
                  </div>
                )}
                {emp.email && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="w-3 h-3" />{emp.email}
                  </div>
                )}
                {emp.specialties.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {emp.specialties.map(s => (
                      <Badge key={s} variant="secondary" className="text-[10px]">{s}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={v => !v && setModalOpen(false)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar Funcionário" : "Novo Funcionário"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>Nome *</Label>
                <Input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Nome completo" />
              </div>
              <div className="space-y-1">
                <Label>E-mail</Label>
                <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="email@exemplo.com" />
              </div>
              <div className="space-y-1">
                <Label>Telefone</Label>
                <Input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="(11) 99999-9999" />
              </div>
              <div className="space-y-1">
                <Label>Comissão (%)</Label>
                <Input type="number" min="0" max="100" value={form.commissionPercent} onChange={e => setForm(p => ({ ...p, commissionPercent: e.target.value }))} />
              </div>
              <div className="space-y-1">
                <Label>Especialidades (vírgula)</Label>
                <Input value={form.specialties} onChange={e => setForm(p => ({ ...p, specialties: e.target.value }))} placeholder="Corte, Coloração" />
              </div>

              <div className="col-span-2 space-y-2">
                <Label className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5" /> Foto do funcionário
                </Label>
                <div className="flex items-center gap-3">
                  <Avatar className="w-16 h-16 flex-shrink-0" style={{ boxShadow: `0 0 0 2px ${form.color}55` }}>
                    {form.photoUrl && <AvatarImage src={form.photoUrl} alt="preview" />}
                    <AvatarFallback style={{ backgroundColor: form.color, color: "#fff" }} className="text-xl font-bold">
                      {form.name.charAt(0).toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col gap-2 flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-2 w-full"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                    >
                      {uploading
                        ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Enviando...</>
                        : <><Camera className="w-3.5 h-3.5" /> {form.photoUrl ? "Trocar foto" : "Escolher foto"}</>
                      }
                    </Button>
                    {form.photoUrl && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-2 w-full text-destructive hover:text-destructive"
                        onClick={() => setForm(p => ({ ...p, photoUrl: "" }))}
                      >
                        <XIcon className="w-3.5 h-3.5" /> Remover foto
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">JPG, PNG ou WebP · máx. 5MB</p>
                  </div>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={handlePhotoUpload}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Cor na agenda</Label>
              <div className="flex gap-2 flex-wrap">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm(p => ({ ...p, color: c }))}
                    className={`w-8 h-8 rounded-full border-2 transition-all ${form.color === c ? "border-white scale-110 shadow-lg" : "border-transparent"}`}
                    style={{ backgroundColor: c }} />
                ))}
                <input type="color" value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} className="w-8 h-8 rounded-full cursor-pointer border-0 bg-transparent" title="Cor personalizada" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Horários de trabalho</Label>
              <div className="space-y-2">
                {DAYS.map(day => (
                  <div key={day} className="flex items-center gap-3">
                    <Switch checked={form.workingHours[day]?.active ?? false} onCheckedChange={v => updateWH(day, "active", v)} />
                    <span className="w-8 text-sm font-medium">{DAY_LABELS[day]}</span>
                    {form.workingHours[day]?.active ? (
                      <>
                        <Input type="time" value={form.workingHours[day]?.start ?? "08:00"} onChange={e => updateWH(day, "start", e.target.value)} className="w-28 h-8 text-sm" />
                        <span className="text-muted-foreground text-sm">até</span>
                        <Input type="time" value={form.workingHours[day]?.end ?? "18:00"} onChange={e => updateWH(day, "end", e.target.value)} className="w-28 h-8 text-sm" />
                      </>
                    ) : (
                      <span className="text-sm text-muted-foreground">Folga</span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {editingId && (
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={v => setForm(p => ({ ...p, active: v }))} />
                <Label>Funcionário ativo</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={handleSubmit} disabled={loading || uploading}>
              {loading ? "Salvando..." : editingId ? "Salvar" : "Cadastrar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
