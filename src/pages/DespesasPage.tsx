import { useState, useEffect } from "react";
import { expensesStore, type Expense } from "@/features/financeiro";
import { format, parseISO, isBefore, startOfDay } from "date-fns";
import { getExpenseMonthRange, shiftExpenseMonth } from "@/lib/expensePeriods";
import { ptBR } from "date-fns/locale";
import { 
  Receipt, Plus, Search, Filter, Trash2, Edit2, 
  AlertCircle, CheckCircle2, Clock, ArrowLeft,
  ChevronDown, ChevronLeft, ChevronRight, X
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Cell 
} from "recharts";

const CATEGORIES = [
  { id: "aluguel", label: "Aluguel", color: "#f87171" },
  { id: "energia", label: "Energia", color: "#fbbf24" },
  { id: "agua", label: "Água", color: "#60a5fa" },
  { id: "internet", label: "Internet", color: "#818cf8" },
  { id: "produtos", label: "Produtos", color: "#34d399" },
  { id: "manutencao", label: "Manutenção", color: "#a78bfa" },
  { id: "marketing", label: "Marketing", color: "#f472b6" },
  { id: "taxas", label: "Taxas", color: "#94a3b8" },
  { id: "salarios", label: "Salários", color: "#fb7185" },
  { id: "impostos", label: "Impostos", color: "#475569" },
  { id: "estoque", label: "Estoque", color: "#2dd4bf" },
  { id: "outras", label: "Outras", color: "#64748b" },
];

const STATUS_OPTIONS = [
  { id: "paga", label: "Paga", color: "#10b981" },
  { id: "pendente", label: "Pendente", color: "#f59e0b" },
];

type ExpenseFormData = Omit<Expense, "id" | "createdAt" | "amount"> & {
  amount: string;
};

export default function DespesasPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  
  // Filtros
  const [filterCategory, setFilterCategory] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [monthAnchor, setMonthAnchor] = useState(() => new Date());

  // Form State
  const [formData, setFormData] = useState<ExpenseFormData>({
    date: format(new Date(), "yyyy-MM-dd"),
    category: "outras",
    description: "",
    amount: "",
    status: "paga" as const,
    notes: "",
  });

  useEffect(() => {
    loadExpenses();
  }, []);

  async function loadExpenses() {
    try {
      setLoading(true);
      const data = await expensesStore.fetchAll();
      setExpenses(data);
    } catch (error) {
      toast.error("Erro ao carregar despesas");
    } finally {
      setLoading(false);
    }
  }

  const { start: monthStart, end: monthEnd } = getExpenseMonthRange(monthAnchor);
  const monthStartKey = format(monthStart, "yyyy-MM-dd");
  const monthEndKey = format(monthEnd, "yyyy-MM-dd");
  const monthExpenses = expenses.filter(expense => expense.date >= monthStartKey && expense.date <= monthEndKey);
  const monthLabel = format(monthStart, "MMMM 'de' yyyy", { locale: ptBR });
  const currentMonthKey = format(new Date(), "yyyy-MM");

  const filteredExpenses = monthExpenses.filter(e => {
    const matchesCategory = !filterCategory || e.category === filterCategory;
    const matchesStatus = !filterStatus || e.status === filterStatus;
    const matchesSearch = !searchQuery || 
      e.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      e.category.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesStatus && matchesSearch;
  }).sort((a, b) => b.date.localeCompare(a.date));

  const stats = {
    total: filteredExpenses.reduce((sum, e) => sum + e.amount, 0),
    pago: filteredExpenses.filter(e => e.status === "paga").reduce((sum, e) => sum + e.amount, 0),
    pendente: filteredExpenses.filter(e => e.status === "pendente" && !isAtrasada(e)).reduce((sum, e) => sum + e.amount, 0),
    atrasado: filteredExpenses.filter(e => e.status === "pendente" && isAtrasada(e)).reduce((sum, e) => sum + e.amount, 0),
  };

  function isAtrasada(expense: Expense) {
    if (expense.status !== "pendente") return false;
    const today = startOfDay(new Date());
    const expenseDate = startOfDay(parseISO(expense.date));
    return isBefore(expenseDate, today);
  }

  const chartData = CATEGORIES.map(cat => ({
    name: cat.label,
    value: monthExpenses.filter(e => e.category === cat.id).reduce((sum, e) => sum + e.amount, 0),
    color: cat.color
  })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);

  async function handleSubmit() {
    if (!formData.description || !formData.amount || !formData.date) {
      toast.error("Preencha todos os campos obrigatórios");
      return;
    }

    try {
      const payload: Omit<Expense, "id" | "createdAt"> = {
        ...formData,
        amount: parseFloat(formData.amount.replace(",", ".")),
      };

      if (editingExpense) {
        await expensesStore.update(editingExpense.id, payload);
        toast.success("Despesa atualizada!");
      } else {
        await expensesStore.create(payload);
        toast.success("Despesa criada!");
      }
      
      setIsModalOpen(false);
      setEditingExpense(null);
      setFormData({
        date: format(monthStart, "yyyy-MM-dd"),
        category: "outras",
        description: "",
        amount: "",
        status: "paga",
        notes: "",
      });
      loadExpenses();
    } catch (error) {
      toast.error("Erro ao salvar despesa");
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("Tem certeza que deseja excluir esta despesa?")) return;
    try {
      await expensesStore.delete(id);
      toast.success("Despesa excluída");
      loadExpenses();
    } catch (error) {
      toast.error("Erro ao excluir");
    }
  }

  function openEdit(expense: Expense) {
    setEditingExpense(expense);
    setFormData({
      date: expense.date,
      category: expense.category,
      description: expense.description,
      amount: expense.amount.toString(),
      status: expense.status,
      notes: expense.notes || "",
    });
    setIsModalOpen(true);
  }

  const accentColor = localStorage.getItem("salon_config") ? JSON.parse(localStorage.getItem("salon_config")!).accentColor : "#ec4899";

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto space-y-6 md:space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-3">
            <div className="p-2 rounded-xl bg-white/5 border border-white/10">
              <Receipt className="w-8 h-8" style={{ color: accentColor }} />
            </div>
            Módulo de Despesas
          </h1>
          <p className="text-white/40 mt-1">Gerencie os custos e saídas do seu salão</p>
        </div>
        <button 
           onClick={() => {
             setEditingExpense(null);
             setFormData({
               date: format(monthStart, "yyyy-MM-dd"),
               category: "outras",
               description: "",
               amount: "",
               status: "paga",
               notes: "",
             });
             setIsModalOpen(true);
           }}
          className="flex items-center justify-center gap-2 px-6 py-3 rounded-2xl font-bold text-white transition-all active:scale-95 shadow-lg"
          style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, boxShadow: `0 8px 24px ${accentColor}40` }}
        >
          <Plus className="w-5 h-5" />
          Nova Despesa
        </button>
      </div>

      {/* Navegação mensal */}
      <div className="rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl p-3 md:p-4 flex items-center justify-between gap-3">
        <button
          type="button"
          aria-label={`Mês anterior a ${monthLabel}`}
          onClick={() => setMonthAnchor(month => shiftExpenseMonth(month, -1))}
          className="w-11 h-11 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="min-w-0 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">Período das despesas</p>
          <h2 className="text-lg md:text-xl font-bold text-white capitalize truncate">{monthLabel}</h2>
          <p className="text-xs text-white/40 mt-0.5">{monthExpenses.length} lançamento(s) neste mês</p>
        </div>
        <button
          type="button"
          aria-label={`Próximo mês após ${monthLabel}`}
          onClick={() => setMonthAnchor(month => shiftExpenseMonth(month, 1))}
          className="w-11 h-11 shrink-0 rounded-2xl bg-white/5 border border-white/10 text-white/70 hover:text-white hover:bg-white/10 transition-colors flex items-center justify-center"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
        {format(monthStart, "yyyy-MM") !== currentMonthKey && (
          <button
            type="button"
            onClick={() => setMonthAnchor(new Date())}
            className="hidden md:block shrink-0 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-semibold text-white/60 hover:text-white transition-colors"
          >
            Mês atual
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: "Total Pago", value: stats.pago, color: "#10b981", icon: CheckCircle2 },
          { label: "Pendente", value: stats.pendente, color: "#f59e0b", icon: Clock },
          { label: "Atrasado", value: stats.atrasado, color: "#ef4444", icon: AlertCircle },
          { label: "Total Geral", value: stats.total, color: accentColor, icon: Receipt },
        ].map((kpi, i) => (
          <div key={i} className="p-4 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon className="w-4 h-4" style={{ color: kpi.color }} />
              <span className="text-[10px] font-bold uppercase tracking-wider text-white/40">{kpi.label}</span>
            </div>
            <div className="text-xl md:text-2xl font-bold text-white">
              {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(kpi.value)}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Gráfico */}
          <div className="lg:col-span-1 p-4 md:p-6 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl space-y-4 md:space-y-6">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <BarChart2 className="w-5 h-5" style={{ color: accentColor }} />
            Por Categoria
          </h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} layout="vertical" margin={{ left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
                <XAxis type="number" hide />
                <YAxis dataKey="name" type="category" stroke="rgba(255,255,255,0.4)" fontSize={12} width={100} />
                <RechartsTooltip 
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  contentStyle={{ backgroundColor: "#1a1a1a", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "12px" }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={20}>
                  {chartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Lista */}
        <div className="lg:col-span-2 space-y-4">
          {/* Filtros */}
           <div className="grid grid-cols-2 md:flex items-center gap-2 md:gap-3">
             <div className="col-span-2 md:flex-1 min-w-0 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
              <input 
                type="text" 
                placeholder="Buscar despesa..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
               className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/10"
              />
            </div>
            <select 
              value={filterCategory} 
              onChange={e => setFilterCategory(e.target.value)}
               className="w-full px-3 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none text-sm"
            >
              <option value="">Todas Categorias</option>
              {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
            <select 
              value={filterStatus} 
              onChange={e => setFilterStatus(e.target.value)}
               className="w-full px-3 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none text-sm"
            >
              <option value="">Todos Status</option>
              <option value="paga">Pagas</option>
              <option value="pendente">Pendentes</option>
            </select>
          </div>

           {/* Cartões para telemóvel */}
           <div className="md:hidden space-y-3">
             {filteredExpenses.length === 0 ? (
               <div className="p-8 rounded-3xl bg-white/5 border border-white/10 text-center text-white/40">
                 Nenhuma despesa encontrada.
               </div>
             ) : filteredExpenses.map(exp => {
               const cat = CATEGORIES.find(c => c.id === exp.category) || CATEGORIES[CATEGORIES.length - 1];
               const atrasada = isAtrasada(exp);
               return (
                 <div key={exp.id} className="rounded-3xl bg-white/5 border border-white/10 p-4 space-y-4">
                   <div className="flex items-start justify-between gap-3">
                     <div className="min-w-0">
                       <p className="text-white font-semibold truncate">{exp.description}</p>
                       <p className="text-xs text-white/40 mt-1">
                         {format(parseISO(exp.date), "dd/MM/yyyy", { locale: ptBR })}
                       </p>
                     </div>
                     <p className="text-white font-bold whitespace-nowrap">
                       {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(exp.amount)}
                     </p>
                   </div>
                   <div className="flex items-center justify-between gap-3">
                     <span className="px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                       {cat.label}
                     </span>
                     <span className={cn(
                       "px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1",
                       exp.status === "paga" ? "bg-emerald-500/20 text-emerald-400" : (atrasada ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400")
                     )}>
                       {exp.status === "paga" ? <CheckCircle2 className="w-3 h-3" /> : (atrasada ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />)}
                       {atrasada ? "Atrasada" : (exp.status === "paga" ? "Paga" : "Pendente")}
                     </span>
                   </div>
                   <div className="flex gap-2 pt-1 border-t border-white/5">
                     <button onClick={() => openEdit(exp)} className="flex-1 py-2.5 rounded-xl bg-white/5 text-white/70 text-sm font-medium">
                       <Edit2 className="w-3.5 h-3.5 inline mr-2" />Editar
                     </button>
                     <button onClick={() => handleDelete(exp.id)} className="px-4 py-2.5 rounded-xl bg-red-500/10 text-red-400">
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </div>
                 </div>
               );
             })}
           </div>

           {/* Tabela para desktop */}
           <div className="hidden md:block rounded-3xl bg-white/5 border border-white/10 backdrop-blur-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-white/40">Data</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-white/40">Categoria</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-white/40">Descrição</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-white/40 text-right">Valor</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-white/40">Status</th>
                    <th className="p-4 text-[10px] font-bold uppercase tracking-wider text-white/40 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {filteredExpenses.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="p-12 text-center text-white/20 italic">
                        Nenhuma despesa encontrada.
                      </td>
                    </tr>
                  ) : (
                    filteredExpenses.map(exp => {
                      const cat = CATEGORIES.find(c => c.id === exp.category) || CATEGORIES[CATEGORIES.length-1];
                      const atrasada = isAtrasada(exp);
                      return (
                        <tr key={exp.id} className="hover:bg-white/[0.02] transition-colors group">
                          <td className="p-4 text-sm text-white/60">
                            {format(parseISO(exp.date), "dd/MM/yy", { locale: ptBR })}
                          </td>
                          <td className="p-4">
                            <span className="px-2 py-1 rounded-lg text-[10px] font-bold uppercase" style={{ backgroundColor: `${cat.color}20`, color: cat.color }}>
                              {cat.label}
                            </span>
                          </td>
                          <td className="p-4 text-sm text-white font-medium">{exp.description}</td>
                          <td className="p-4 text-sm font-bold text-white text-right">
                            {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(exp.amount)}
                          </td>
                          <td className="p-4">
                            <span className={cn(
                              "px-2 py-1 rounded-lg text-[10px] font-bold uppercase flex items-center gap-1 w-fit",
                              exp.status === "paga" ? "bg-emerald-500/20 text-emerald-500" : (atrasada ? "bg-red-500/20 text-red-500" : "bg-amber-500/20 text-amber-500")
                            )}>
                              {exp.status === "paga" ? <CheckCircle2 className="w-3 h-3" /> : (atrasada ? <AlertCircle className="w-3 h-3" /> : <Clock className="w-3 h-3" />)}
                              {atrasada ? "Atrasada" : (exp.status === "paga" ? "Paga" : "Pendente")}
                            </span>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => openEdit(exp)} className="p-2 rounded-xl bg-white/5 hover:bg-white/10 text-white/60 hover:text-white transition-all">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => handleDelete(exp.id)} className="p-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-500/60 hover:text-red-500 transition-all">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Nova/Editar */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 animate-in fade-in zoom-in duration-200">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative w-full max-w-lg rounded-[32px] bg-[#121212] border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <h3 className="text-xl font-bold text-white flex items-center gap-2">
                {editingExpense ? <Edit2 className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                {editingExpense ? "Editar Despesa" : "Nova Despesa"}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 rounded-full hover:bg-white/5 text-white/40">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Data</label>
                  <input 
                    type="date" 
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/10"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Categoria</label>
                  <select 
                    value={formData.category}
                    onChange={e => setFormData({ ...formData, category: e.target.value as Expense["category"] })}
                    className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none"
                  >
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Descrição</label>
                <input 
                  type="text" 
                  placeholder="Ex: Aluguel do mês"
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/10"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Valor (R$)</label>
                  <input 
                    type="text" 
                    placeholder="0,00"
                    value={formData.amount}
                    onChange={e => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/10 font-bold"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Status</label>
                  <div className="flex gap-2">
                    {STATUS_OPTIONS.map(opt => (
                      <button
                        key={opt.id}
                        onClick={() => setFormData({ ...formData, status: opt.id as Expense["status"] })}
                        className={cn(
                          "flex-1 py-3 rounded-2xl text-[10px] font-bold uppercase border transition-all",
                          formData.status === opt.id 
                            ? "bg-white/10 border-white/20 text-white" 
                            : "bg-transparent border-white/5 text-white/20 hover:border-white/10"
                        )}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase tracking-wider text-white/40 ml-1">Observações</label>
                <textarea 
                  rows={3}
                  placeholder="Detalhes adicionais..."
                  value={formData.notes ?? ""}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/10 resize-none"
                />
              </div>
            </div>

            <div className="p-6 bg-white/[0.02] border-t border-white/5 flex gap-3">
              <button 
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-4 rounded-2xl font-bold text-white/40 hover:bg-white/5 transition-all"
              >
                Cancelar
              </button>
              <button 
                onClick={handleSubmit}
                className="flex-[2] py-4 rounded-2xl font-bold text-white shadow-lg transition-all active:scale-95"
                style={{ background: `linear-gradient(135deg, ${accentColor}, ${accentColor}cc)`, boxShadow: `0 8px 24px ${accentColor}40` }}
              >
                {editingExpense ? "Salvar Alterações" : "Criar Despesa"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BarChart2(props: any) {
  return (
    <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
