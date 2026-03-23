import { BookOpen, ClipboardList, FileQuestion, GitBranch, GraduationCap, MessageSquare, Presentation, Upload } from 'lucide-react';

const icons = {
  Ingest: Upload,
  Flashcards: BookOpen,
  'Concept Map': GitBranch,
  Tasks: ClipboardList,
  Quizzes: FileQuestion,
  Chat: MessageSquare,
  Presentations: Presentation,
  Academics: GraduationCap,
  'AI Tutor': BookOpen,
};

export default function SidebarNav({ tabs, tab, onChange }) {
  return (
    <aside className="w-full border-r border-border bg-white/85 p-3 backdrop-blur md:w-64 md:p-4">
      <div className="mb-4 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-sky-500 p-3 text-white shadow-soft">
        <h1 className="text-lg font-semibold">Student Assistant</h1>
        <p className="text-xs text-indigo-100">Learn smarter every day</p>
      </div>
      <nav className="flex gap-2 overflow-x-auto pb-1 md:flex-col md:overflow-visible">
        {tabs.map((item) => {
          const Icon = icons[item] || BookOpen;
          const active = tab === item;
          return (
            <button
              key={item}
              onClick={() => onChange(item)}
              className={`flex min-w-fit items-center gap-2 rounded-xl px-3 py-2 text-left text-sm md:min-w-0 ${
                active
                  ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-soft'
                  : 'border border-border bg-white/95 text-text hover:bg-indigo-50'
              }`}
            >
              <Icon size={16} />
              <span>{item}</span>
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
