import { extractHttpUrls } from "./fileAttachments";

function MessageText({ text, className = "" }: { text: string; className?: string }) {
  const urls = extractHttpUrls(text);
  if (urls.length === 0) return <p className={className}>{text}</p>;

  const parts: Array<{ value: string; url?: string }> = [];
  let cursor = 0;
  urls.forEach((url) => {
    const index = text.indexOf(url, cursor);
    if (index < 0) return;
    if (index > cursor) parts.push({ value: text.slice(cursor, index) });
    parts.push({ value: url, url });
    cursor = index + url.length;
  });
  if (cursor < text.length) parts.push({ value: text.slice(cursor) });

  return <p className={className}>{parts.map((part, index) => part.url ? <a key={`${part.url}:${index}`} href={part.url} target="_blank" rel="noopener noreferrer" className="chat-message-link break-all font-semibold underline decoration-current/50 underline-offset-2 hover:decoration-current focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30">{part.value}</a> : <span key={index}>{part.value}</span>)}</p>;
}

export default MessageText;
