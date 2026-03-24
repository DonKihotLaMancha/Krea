import {
  BarChart3,
  Bell,
  CalendarDays,
  FolderTree,
  ClipboardList,
  FileQuestion,
  LayoutDashboard,
  Library,
  MessageCircleMore,
  PenLine,
  ScrollText,
} from 'lucide-react';

const items = [
  { id: 'dashboard', label: 'Dashboard', Icon: LayoutDashboard },
  { id: 'lms-courses', label: 'LMS Courses', Icon: Library },
  { id: 'lms-modules', label: 'Modules', Icon: FolderTree },
  { id: 'lms-discussions', label: 'Discussions', Icon: MessageCircleMore },
  { id: 'lms-calendar', label: 'Calendar', Icon: CalendarDays },
  { id: 'lms-analytics', label: 'LMS Analytics', Icon: BarChart3 },
  { id: 'materials', label: 'Materials', Icon: ScrollText },
  { id: 'quizzes', label: 'Quiz builder', Icon: FileQuestion },
  { id: 'assignments', label: 'Assignments', Icon: ClipboardList },
  { id: 'progress', label: 'Progress', Icon: BarChart3 },
  { id: 'announcements', label: 'Announcements', Icon: Bell },
  { id: 'grading', label: 'Grading', Icon: PenLine },
];

export default function TeacherSidebar({ active, onChange, collapsed, onToggleCollapse }) {
  return (
    <aside
      className={`flex w-full flex-col border-b border-slate-800 bg-slate-900 text-slate-100 md:sticky md:top-0 md:h-screen md:border-b-0 md:border-r ${collapsed ? 'md:w-[72px]' : 'md:w-60'}`}
    >
      <div className={`border-b border-white/10 px-3 py-4 ${collapsed ? 'text-center' : ''}`}>
        {!collapsed ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-indigo-300">Teacher portal</p>
            <h1 className="mt-0.5 text-lg font-semibold text-white">Classes &amp; grading</h1>
          </>
        ) : (
          <span className="text-xs font-bold text-white">TP</span>
        )}
      </div>
      <button
        type="button"
        className="mx-2 mt-2 hidden rounded border border-white/15 bg-white/5 px-2 py-1.5 text-xs text-white/90 hover:bg-white/10 md:block"
        onClick={onToggleCollapse}
      >
        {collapsed ? 'Expand' : 'Collapse'}
      </button>
      <nav className="flex gap-1 overflow-x-auto px-2 py-3 md:flex-1 md:flex-col md:overflow-y-auto">
        {items.map(({ id, label, Icon }) => {
          const isActive = active === id;
          return (
            <button
              key={id}
              type="button"
              title={label}
              onClick={() => onChange(id)}
              className={`flex min-w-fit items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm font-medium transition-colors md:min-w-0 ${
                isActive ? 'bg-indigo-600 text-white shadow-md' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-90" />
              {!collapsed ? <span>{label}</span> : null}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
