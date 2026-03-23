export default function NoticeBanner({ text }) {
  if (!text) return null;
  return (
    <div className="mb-4 rounded-xl border border-violet-200 bg-gradient-to-r from-indigo-50 via-violet-50 to-cyan-50 px-4 py-2 text-sm text-indigo-900 shadow-sm">
      {text}
    </div>
  );
}
