interface PhaseBarProps {
  phase: 'VOTE' | 'PICK_DAYS' | 'RESULTS' | 'FINALIZED' | 'FAILED';
}

const STEPS: Array<{ phase: PhaseBarProps['phase']; label: string; icon: string; description: string }> = [
  { phase: 'VOTE', label: 'Vote', icon: '🗳️', description: 'Attendees vote IN/OUT' },
  { phase: 'PICK_DAYS', label: 'Set Availability', icon: '📅', description: 'Mark unavailable dates' },
  { phase: 'RESULTS', label: 'Results', icon: '📊', description: 'View availability results' },
  { phase: 'FINALIZED', label: 'Final Date', icon: '🎉', description: 'Event is scheduled' },
];

export default function PhaseBar({ phase }: PhaseBarProps) {
  if (phase === 'FAILED') {
    return (
      <div className="card flex items-center justify-between bg-red-50 text-red-700 border-red-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-red-600">❌</span>
          </div>
          <div>
            <span className="text-sm font-semibold">Voting closed without quorum</span>
            <p className="text-xs text-red-600">Event marked as failed</p>
          </div>
        </div>
        <span className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded-full">Failed</span>
      </div>
    );
  }

  const activeIndex = STEPS.findIndex((step) => step.phase === phase);

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-2 mb-4">
        <h3 className="text-sm font-semibold text-slate-900">Event Progress</h3>
        <span className="text-xs text-slate-500">Step {activeIndex + 1} of {STEPS.length}</span>
      </div>
      <div className="flex items-center justify-between gap-2">
        {STEPS.map((step, index) => {
          const status = index < activeIndex ? 'done' : index === activeIndex ? 'active' : 'todo';
          const badgeClass =
            status === 'done'
              ? 'bg-green-600 text-white shadow-sm'
              : status === 'active'
              ? 'border-2 border-blue-600 text-blue-600 bg-blue-50'
              : 'border-2 border-slate-200 text-slate-400 bg-slate-50';
          const labelClass = status === 'todo' ? 'text-slate-400' : 'text-slate-700';
          const descriptionClass = status === 'todo' ? 'text-slate-400' : 'text-slate-500';
          
          return (
            <div key={step.phase} className="flex flex-1 flex-col items-center gap-2">
              <div className="flex flex-col items-center gap-1">
                <span className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-semibold transition-all duration-200 ${badgeClass}`}>
                  {status === 'done' ? '✓' : step.icon}
                </span>
                <span className={`text-xs font-medium text-center ${labelClass}`}>{step.label}</span>
                <span className={`text-xs text-center leading-tight ${descriptionClass}`}>{step.description}</span>
              </div>
              {index < STEPS.length - 1 && (
                <div className={`w-full h-0.5 mt-2 ${
                  index < activeIndex ? 'bg-green-600' : 'bg-slate-200'
                }`} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}