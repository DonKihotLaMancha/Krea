export default function NoticeBanner({ text }) {
  if (!text) return null;
  return (
    <div className="mb-4 rounded-md border border-canvas-primary/20 bg-[#e8f4fc] px-4 py-2 text-sm text-slate-900">
      {text}
    </div>
  );
}
