import { BookOpen, ClipboardList, FileQuestion, GitBranch, GraduationCap, MessageSquare, Presentation, Upload, UserRoundCog } from 'lucide-react';

const icons = {
  Ingest: Upload,
  Flashcards: BookOpen,
  Notebook: BookOpen,
  'Concept Map': GitBranch,
  Tasks: ClipboardList,
  Quizzes: FileQuestion,
  Chat: MessageSquare,
  Presentations: Presentation,
  Academics: GraduationCap,
  'AI Tutor': BookOpen,
  'Teacher Window': UserRoundCog,
};

export default function SidebarNav({ tabs, tab, onChange, collapsed, onToggleCollapse, isFocusMode }) {
  if (isFocusMode) return null;
  return (
    <aside className={`w-full border-r border-border/80 bg-white/92 p-3 backdrop-blur md:sticky md:top-0 md:h-screen ${collapsed ? 'md:w-20 md:p-2' : 'md:w-64 md:p-4'}`}>
      <div className="mb-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-sky-500 p-3 text-white shadow-soft">
        {!collapsed ? (
          <>
            <h1 className="text-lg font-semibold">Student Assistant</h1>
            <p className="text-xs text-indigo-100">Learn smarter every day</p>
          </>
        ) : (
          <h1 className="text-center text-base font-semibold">SA</h1>
        )}
      </div>
      <button className="btn-ghost mb-2 hidden w-full text-xs md:block" onClick={onToggleCollapse}>
        {collapsed ? 'Expand' : 'Collapse'}
      </button>
      <nav className="flex gap-2 overflow-x-auto pb-1 md:h-[calc(100vh-160px)] md:flex-col md:overflow-auto">
        {tabs.map((item) => {
          const Icon = icons[item] || BookOpen;
          const active = tab === item;
          return (
            <button
              key={item}
              type="button"
              onClick={() => onChange(item)}
              title={item}
              className={`flex min-w-fit w-full items-stretch overflow-hidden rounded-xl p-0 text-left text-sm transition-colors md:min-w-0 ${
                active
                  ? 'shadow-sm ring-1 ring-indigo-200/80'
                  : 'border border-border/70 bg-white/80 text-slate-700 hover:border-indigo-200/70 hover:bg-indigo-50/60 hover:text-slate-900'
              }`}
            >
              {active ? (
                <span className="w-1.5 shrink-0 bg-indigo-600" aria-hidden />
              ) : null}
              <span
                className={`flex flex-1 items-center gap-2 px-3 py-2 ${collapsed ? 'justify-center' : ''} ${
                  active ? 'bg-gradient-to-r from-indigo-50/95 via-white to-cyan-50/40 text-slate-900' : ''
                }`}
              >
                <Icon size={16} className={active ? 'text-indigo-700' : 'text-slate-500'} />
                {!collapsed ? <span>{item}</span> : null}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
