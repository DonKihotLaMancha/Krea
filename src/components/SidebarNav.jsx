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

/** Canvas-style dark rail: light/white text on dark background. */
export default function SidebarNav({ tabs, tab, onChange, collapsed, onToggleCollapse, isFocusMode }) {
  if (isFocusMode) return null;

  return (
    <aside
      className={`w-full border-r border-black/20 bg-canvas-nav p-3 text-white md:sticky md:top-0 md:h-screen ${collapsed ? 'md:w-20 md:p-2' : 'md:w-64 md:p-4'}`}
      style={{ backgroundColor: '#394b58', color: '#ffffff' }}
    >
      <div className={`mb-4 border-b border-white/15 pb-3 ${collapsed ? 'text-center' : ''}`}>
        {!collapsed ? (
          <>
            <h1 className="text-base font-semibold text-white">Student Assistant</h1>
            <p className="text-xs font-medium text-white/65">Dashboard</p>
          </>
        ) : (
          <h1 className="text-center text-sm font-semibold text-white">SA</h1>
        )}
      </div>
      <button
        type="button"
        className="mb-2 hidden w-full rounded border border-white/20 bg-white/10 px-2 py-1.5 text-xs font-medium text-white hover:bg-white/15 md:block"
        onClick={onToggleCollapse}
      >
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
              className={`flex min-w-fit w-full items-stretch overflow-hidden rounded-none p-0 text-left text-sm font-medium transition-colors md:min-w-0 ${
                active
                  ? 'bg-canvas-navActive text-white'
                  : 'text-white/88 hover:bg-canvas-navHover hover:text-white'
              }`}
            >
              {active ? <span className="w-1 shrink-0 bg-white" aria-hidden /> : null}
              <span className={`flex flex-1 items-center gap-2 px-3 py-2.5 ${collapsed ? 'justify-center' : ''}`}>
                <Icon size={16} className={active ? 'text-white' : 'text-white/75'} />
                {!collapsed ? <span>{item}</span> : null}
              </span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
