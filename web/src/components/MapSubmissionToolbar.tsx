import React from 'react';
import { Camera, Plus, MapPin, Layers, Info, HelpCircle } from 'lucide-react';

interface MapSubmissionToolbarProps {
  onSubmitObservation: () => void;
  onOpenLegend?: () => void;
  onOpenHelp?: () => void;
  className?: string;
}

/**
 * A floating map toolbar inspired by Calcite Design System.
 * Specifically handles the "Submit Field Observation" service for Earth Talk.
 */
export const MapSubmissionToolbar: React.FC<MapSubmissionToolbarProps> = ({
  onSubmitObservation,
  onOpenLegend,
  onOpenHelp,
  className = '',
}) => {
  return (
    <div 
      className={`absolute left-4 top-1/2 -translate-y-1/2 z-30 flex flex-col gap-3 ${className}`}
      role="toolbar"
      aria-orientation="vertical"
      aria-label="Map Services"
    >
      {/* Primary Action Group: Data Collection */}
      <div className="flex flex-col bg-white rounded-2xl shadow-xl border border-[#dadce0] overflow-hidden p-1.5 gap-1">
        <button
          type="button"
          onClick={onSubmitObservation}
          className="group relative w-10 h-10 flex items-center justify-center rounded-xl text-[#444746] hover:text-[#0b57d0] hover:bg-[#f0f4f9] transition-all"
          title="Submit Field Observation"
        >
          <Plus className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1f1f1f] text-white text-[11px] font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all translate-x-[-10px] group-hover:translate-x-0 shadow-sm">
            Submit Field Observation
          </span>
        </button>
        
        <button
          type="button"
          onClick={onSubmitObservation}
          className="group relative w-10 h-10 flex items-center justify-center rounded-xl text-[#444746] hover:text-[#0b57d0] hover:bg-[#f0f4f9] transition-all"
          title="Camera Submission"
        >
          <Camera className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1f1f1f] text-white text-[11px] font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all translate-x-[-10px] group-hover:translate-x-0 shadow-sm">
            Photo Observation
          </span>
        </button>
      </div>

      {/* Secondary Action Group: Map Utility */}
      <div className="flex flex-col bg-white rounded-2xl shadow-xl border border-[#dadce0] overflow-hidden p-1.5 gap-1">
        <button
          type="button"
          onClick={onOpenLegend}
          className="group relative w-10 h-10 flex items-center justify-center rounded-xl text-[#444746] hover:text-[#0b57d0] hover:bg-[#f0f4f9] transition-all"
          title="Map Legend"
        >
          <Layers className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1f1f1f] text-white text-[11px] font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all translate-x-[-10px] group-hover:translate-x-0 shadow-sm">
            Map Legend
          </span>
        </button>

        <button
          type="button"
          onClick={onOpenHelp}
          className="group relative w-10 h-10 flex items-center justify-center rounded-xl text-[#444746] hover:text-[#0b57d0] hover:bg-[#f0f4f9] transition-all"
          title="Help & Guidance"
        >
          <HelpCircle className="w-5 h-5 group-hover:scale-110 transition-transform" />
          <span className="absolute left-full ml-3 px-2.5 py-1.5 bg-[#1f1f1f] text-white text-[11px] font-medium rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-all translate-x-[-10px] group-hover:translate-x-0 shadow-sm">
            Help & Guide
          </span>
        </button>
      </div>
    </div>
  );
};
