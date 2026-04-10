/**
 * ContentRenderer — renders agent markdown output as structured blocks.
 * Handles: ## headings, ### subheadings, **bold**, - bullets, 1. numbered, paragraphs.
 * No external library needed; all patterns come from real agent outputs.
 */
export function ContentRenderer({ content }: { content: string }) {
  const blocks = content.split('\n\n').filter(Boolean);

  return (
    <div className="space-y-4">
      {blocks.map((block, i) => {
        const lines = block.split('\n').filter(Boolean);

        // H2 heading
        if (lines.length === 1 && lines[0].startsWith('## ')) {
          return (
            <h2
              key={i}
              className="font-serif text-xl text-[var(--armada-text)] pt-2 border-b border-[var(--armada-accent)]/40 pb-2"
            >
              {lines[0].slice(3)}
            </h2>
          );
        }

        // H3 heading
        if (lines.length === 1 && lines[0].startsWith('### ')) {
          return (
            <h3
              key={i}
              className="font-serif text-base text-[var(--armada-text)] font-medium"
            >
              {lines[0].slice(4)}
            </h3>
          );
        }

        // Pure numbered list block
        if (lines.every((l) => /^\d+\. /.test(l))) {
          return (
            <ol key={i} className="space-y-2 ml-1">
              {lines.map((line, j) => (
                <li
                  key={j}
                  className="flex gap-2.5 text-sm text-[var(--armada-text)]/80 leading-relaxed"
                >
                  <span className="font-mono text-[10px] text-[var(--armada-primary)] mt-0.5 shrink-0 w-4">
                    {j + 1}.
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: inlineBold(line.replace(/^\d+\. /, '')) }} />
                </li>
              ))}
            </ol>
          );
        }

        // Pure bullet list block
        if (lines.every((l) => l.startsWith('- ') || l.startsWith('• '))) {
          return (
            <ul key={i} className="space-y-2 ml-1">
              {lines.map((line, j) => (
                <li key={j} className="flex gap-2.5 text-sm text-[var(--armada-text)]/80 leading-relaxed">
                  <span className="text-[var(--armada-primary)] mt-1.5 shrink-0">
                    <svg width="5" height="5" viewBox="0 0 5 5" fill="currentColor">
                      <circle cx="2.5" cy="2.5" r="2.5" />
                    </svg>
                  </span>
                  <span
                    dangerouslySetInnerHTML={{
                      __html: inlineBold(line.replace(/^[-•] /, '')),
                    }}
                  />
                </li>
              ))}
            </ul>
          );
        }

        // Mixed block: some bullet lines, some text lines (common in agent output)
        if (lines.some((l) => l.startsWith('- ') || l.startsWith('• ') || /^\d+\. /.test(l))) {
          return (
            <div key={i} className="space-y-2">
              {lines.map((line, j) => {
                if (line.startsWith('- ') || line.startsWith('• ')) {
                  return (
                    <div key={j} className="flex gap-2.5 text-sm text-[var(--armada-text)]/80 leading-relaxed ml-1">
                      <span className="text-[var(--armada-primary)] mt-1.5 shrink-0">
                        <svg width="5" height="5" viewBox="0 0 5 5" fill="currentColor">
                          <circle cx="2.5" cy="2.5" r="2.5" />
                        </svg>
                      </span>
                      <span dangerouslySetInnerHTML={{ __html: inlineBold(line.replace(/^[-•] /, '')) }} />
                    </div>
                  );
                }
                if (/^\d+\. /.test(line)) {
                  const num = line.match(/^(\d+)\. /)?.[1] ?? '';
                  return (
                    <div key={j} className="flex gap-2.5 text-sm text-[var(--armada-text)]/80 leading-relaxed ml-1">
                      <span className="font-mono text-[10px] text-[var(--armada-primary)] mt-0.5 shrink-0 w-4">{num}.</span>
                      <span dangerouslySetInnerHTML={{ __html: inlineBold(line.replace(/^\d+\. /, '')) }} />
                    </div>
                  );
                }
                if (line.startsWith('## ')) {
                  return <h2 key={j} className="font-serif text-xl text-[var(--armada-text)] pt-1">{line.slice(3)}</h2>;
                }
                if (line.startsWith('### ')) {
                  return <h3 key={j} className="font-serif text-base text-[var(--armada-text)] font-medium">{line.slice(4)}</h3>;
                }
                return (
                  <p
                    key={j}
                    className="text-sm text-[var(--armada-text)]/80 leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: inlineBold(line) }}
                  />
                );
              })}
            </div>
          );
        }

        // Single-line H2/H3 that ended up in same paragraph
        if (lines.length === 1 && lines[0].startsWith('# ')) {
          return (
            <h2 key={i} className="font-serif text-2xl text-[var(--armada-text)]">
              {lines[0].slice(2)}
            </h2>
          );
        }

        // Plain paragraph (may be multi-line, each line separated by \n)
        return (
          <div key={i} className="space-y-1.5">
            {lines.map((line, j) => (
              <p
                key={j}
                className="text-sm text-[var(--armada-text)]/80 leading-relaxed"
                dangerouslySetInnerHTML={{ __html: inlineBold(line) }}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

/** Replace **text** with styled <strong> — safe on controlled agent output. */
function inlineBold(text: string): string {
  return text.replace(
    /\*\*(.*?)\*\*/g,
    '<strong style="color:var(--armada-text);font-weight:600">$1</strong>'
  );
}
