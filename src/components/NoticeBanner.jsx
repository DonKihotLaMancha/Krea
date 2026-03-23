export default function NoticeBanner({ text }) {
  if (!text) return null;
  return <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm text-blue-900">{text}</div>;
}
