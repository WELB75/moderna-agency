const URL_REGEX = /(https?:\/\/[^\s]+|www\.[^\s]+|(?:[\w.+-]+@[\w-]+\.[\w.-]+))/g;

export function LinkifiedText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(URL_REGEX);

  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (!part) return null;
        if (/^https?:\/\//.test(part)) {
          return (
            <a
              key={i}
              href={part}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        if (/^www\./.test(part)) {
          return (
            <a
              key={i}
              href={`https://${part}`}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        if (/^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(part)) {
          return (
            <a
              key={i}
              href={`mailto:${part}`}
              className="text-primary underline underline-offset-2"
              onClick={(e) => e.stopPropagation()}
            >
              {part}
            </a>
          );
        }
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}
