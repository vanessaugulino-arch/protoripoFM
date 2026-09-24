// src/app/components/ReferenceYearSelector.tsx
// Seletor "Ano de Referência" — mesmo conceito já usado em Planning.tsx (M1):
// qual ano do histórico real (sales_history) serve de base de comparação
// pro "Ano Anterior" mostrado na tela. Default = penúltimo ano disponível
// (mesma regra do M1), mas o usuário pode escolher outro.

export function ReferenceYearSelector({
  years,
  value,
  onChange,
}: {
  years: number[];
  value: number | undefined;
  onChange: (year: number) => void;
}) {
  if (years.length === 0) return null;

  return (
    <div className="inline-flex items-center gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-widest text-[#28071C]/40">Ano de Referência</span>
      <select
        value={value ?? ""}
        onChange={e => onChange(Number(e.target.value))}
        className="bg-white rounded-lg px-2 py-1 text-xs font-semibold text-[#28071C] border-2 border-[#7598CF]/30 focus:border-[#7598CF] focus:outline-none cursor-pointer"
      >
        {years.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
    </div>
  );
}
