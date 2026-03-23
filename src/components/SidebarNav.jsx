import { BookOpen, ClipboardList, FileQuestion, GraduationCap, MessageSquare, Presentation, Upload } from 'lucide-react';

const icons = {
  Ingest: Upload,
  Flashcards: BookOpen,
  Tasks: ClipboardList,
  Quizzes: FileQuestion,
  Chat: MessageSquare,
  Presentations: Presentation,
  Academics: GraduationCap,
  'AI Tutor': BookOpen,
};

export default function SidebarNav({ tabs, tab, onChange }) {
  return (
    <aside className="w-64 border-r border-border bg-white p-4">
      <h1 className="mb-4 text-lg font-semibold">Student Assistant</h1>
      <nav className="flex flex-col gap-2">
        {tabs.map((item) => {
          const Icon = icons[item] || BookOpen;
          const active = tab === item;
          return (
            <button
              key={item}
              onClick={() => onChange(item)}
              className={`flex items-center gap-2 rounded-xl px-3 py-2 text-left text-sm ${
                active ? 'bg-accent text-white' : 'border border-border bg-white text-text hover:bg-slate-50'
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
