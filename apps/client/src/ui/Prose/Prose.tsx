import { Fragment, type JSX } from 'react';
import styles from './Prose.module.scss';

/**
 * Operator-written text, rendered safely.
 *
 * News posts and mail bodies are markdown-lite: blank-line paragraphs, `**strong**` and
 * `*emphasis*`. This renders them as React elements and **never as HTML** — no
 * `dangerouslySetInnerHTML`, no sanitiser to keep up to date, and therefore no way for a
 * post to put markup into every player's browser. "We trust our own operators" is not an
 * argument that survives one compromised admin session, and a feed is the most broadcast
 * surface the game has.
 *
 * Anything the grammar does not cover renders as the literal characters the operator typed,
 * which is the right failure: text that looks slightly wrong beats text that disappeared.
 */
export function Prose({ text, className }: { text: string; className?: string }): JSX.Element {
  const paragraphs = text.split(/\n{2,}/).filter((block) => block.trim().length > 0);

  return (
    <div className={className ? `${styles.prose} ${className}` : styles.prose}>
      {paragraphs.map((block, index) => (
        <p key={index}>{inline(block)}</p>
      ))}
    </div>
  );
}

/**
 * `**strong**` and `*emphasis*`, plus single newlines as line breaks.
 *
 * One pass with a single alternation rather than nested replacements: the classic bug here
 * is emphasis eating the inner halves of a `**bold**`, which a strong-first alternation
 * avoids by construction.
 */
function inline(block: string): JSX.Element[] {
  const pattern = /(\*\*[^*]+\*\*|\*[^*]+\*)/g;
  const pieces = block.split(pattern).filter((piece) => piece !== '');

  return pieces.map((piece, index) => {
    if (piece.startsWith('**') && piece.endsWith('**') && piece.length > 4) {
      return <strong key={index}>{piece.slice(2, -2)}</strong>;
    }
    if (piece.startsWith('*') && piece.endsWith('*') && piece.length > 2) {
      return <em key={index}>{piece.slice(1, -1)}</em>;
    }
    // Single newlines inside a paragraph are breaks, which is what an operator writing a
    // list of three lines means by pressing return.
    const lines = piece.split('\n');
    return (
      <Fragment key={index}>
        {lines.map((line, lineIndex) => (
          <Fragment key={lineIndex}>
            {lineIndex > 0 && <br />}
            {line}
          </Fragment>
        ))}
      </Fragment>
    );
  });
}
