import { useState } from "react";
import { X } from "lucide-react";
import { ActionButton } from "./ActionButton";

interface ApprovalModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApprove: (observations: string) => void;
  title: string;
  currentUser: string;
  nextProfile?: string;
  summaryData?: {
    label: string;
    value: string | number;
  }[];
  isLoading?: boolean;
}

export function ApprovalModal({
  isOpen,
  onClose,
  onApprove,
  title,
  currentUser,
  nextProfile,
  summaryData,
  isLoading = false,
}: ApprovalModalProps) {
  const [observations, setObservations] = useState("");

  if (!isOpen) return null;

  const handleApprove = () => {
    onApprove(observations);
    setObservations("");
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-[#7598CF] to-[#B8A8E0] px-6 py-4 flex items-center justify-between">
          <h2 className="text-[#F6F3AA] text-xl font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="text-[#F6F3AA] hover:opacity-80 transition-opacity"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Summary Data */}
          {summaryData && summaryData.length > 0 && (
            <div className="mb-6">
              <h3 className="text-[#28071C] text-lg font-semibold mb-4">
                Resumo do Planejamento
              </h3>
              <div className="bg-[#E7E7E6] rounded-lg p-4 space-y-3">
                {summaryData.map((item, index) => (
                  <div key={index} className="flex justify-between items-center">
                    <span className="text-[#28071C]/70 text-sm">{item.label}</span>
                    <span className="text-[#28071C] font-semibold">{item.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Observations */}
          <div className="mb-6">
            <label className="block text-[#28071C] font-semibold mb-2">
              Observações e Direcionamentos
            </label>
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              placeholder="Adicione observações sobre este planejamento..."
              className="w-full px-4 py-3 border-2 border-[#E7E7E6] rounded-lg focus:border-[#7598CF] focus:outline-none resize-none"
              rows={6}
            />
          </div>

          {/* Next Step Info */}
          {nextProfile && (
            <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-[#28071C] text-sm">
                <span className="font-semibold">Próxima etapa:</span> Após aprovação, 
                o planejamento será liberado para <span className="font-bold">{nextProfile}</span>
              </p>
            </div>
          )}

          {/* Approved By */}
          <div className="mb-6 text-sm text-[#28071C]/60">
            Aprovado por: <span className="font-semibold">{currentUser}</span>
          </div>

          {/* Actions */}
          <div className="flex space-x-4">
            <ActionButton
              label="Cancelar"
              onClick={onClose}
              variant="outline"
              fullWidth
            />
            <ActionButton
              id="btn_aplicar_metas"
              label="Aplicar Metas"
              onClick={handleApprove}
              variant="primary"
              fullWidth
              loading={isLoading}
              disabled={!observations.trim()}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
