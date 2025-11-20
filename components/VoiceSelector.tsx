import React from 'react';
import { VoiceName } from '../types';
import { Mic } from 'lucide-react';

interface VoiceSelectorProps {
  selected: VoiceName;
  onSelect: (voice: VoiceName) => void;
}

export const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selected, onSelect }) => {
  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-bold text-slate-500 uppercase tracking-wider flex items-center gap-2">
        <Mic size={16} />
        选择讲解员
      </label>
      <div className="flex flex-wrap gap-2">
        {Object.values(VoiceName).map((voice) => (
          <button
            key={voice}
            onClick={() => onSelect(voice)}
            className={`px-3 py-1 rounded-full text-sm font-semibold transition-colors border-2 ${
              selected === voice
                ? 'bg-indigo-100 border-indigo-500 text-indigo-700'
                : 'bg-white border-slate-200 text-slate-600 hover:border-indigo-300'
            }`}
          >
            {voice}
          </button>
        ))}
      </div>
    </div>
  );
};