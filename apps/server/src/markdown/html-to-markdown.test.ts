import { describe, expect, it } from 'vitest';
import { htmlToMarkdown } from './html-to-markdown';

describe('HTML to Markdown', () => {
  it('turns tables into GFM rows with escaped pipes', () => {
    const md = htmlToMarkdown('<table><tr><th>A</th><th>B</th></tr><tr><td><code>x|y</code></td><td>2<br>3</td></tr></table>');
    expect(md).toBe('| A | B |\n| --- | --- |\n| `x\\|y` | 2 3 |');
  });

  it('fences pre blocks with or without code, keeping their text', () => {
    expect(htmlToMarkdown('<pre><code class="language-yaml">a: 1\n  b: 2\n</code></pre>')).toBe('```yaml\na: 1\n  b: 2\n```');
    expect(htmlToMarkdown('<pre><span class="c"># note</span>\nls -l</pre>')).toBe('```\n# note\nls -l\n```');
  });

  it('drops page chrome', () => {
    expect(htmlToMarkdown('<html><head><title>T</title><style>p{}</style></head><body><nav>menu</nav><h2>Hi</h2><script>x()</script></body></html>')).toBe('## Hi');
  });
});
