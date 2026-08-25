import { describe, expect, it } from 'vitest'
import { decodeEscapedHtml, looksEscapedHtml, repairEscapedHtml } from '../server/escapedHtml.ts'

describe('escaped-html guard', () => {
  it('catches a whole document sent as entities', () => {
    const sent = '&lt;!doctype html&gt;&lt;html&gt;&lt;body&gt;&lt;h1&gt;Settings&lt;/h1&gt;&lt;/body&gt;&lt;/html&gt;'
    expect(looksEscapedHtml(sent)).toBe(true)
    expect(repairEscapedHtml(sent)).toBe('<!doctype html><html><body><h1>Settings</h1></body></html>')
  })

  it('leaves real markup alone, escaped code samples included', () => {
    const design = '<!doctype html><html><body><code>&lt;div class="card"&gt;</code></body></html>'
    expect(looksEscapedHtml(design)).toBe(false)
    expect(repairEscapedHtml(design)).toBe(design)
  })

  it('ignores prose that merely mentions an entity', () => {
    expect(looksEscapedHtml('Widths under &lt; 600px collapse the grid.')).toBe(false)
    expect(looksEscapedHtml('a &lt; b &amp;&amp; b &gt; c')).toBe(false)
  })

  it('handles numeric entities and restores ampersands last', () => {
    expect(repairEscapedHtml('&#60;a href=&quot;/x?a=1&amp;b=2&quot;&#62;Go&#60;/a&#62;')).toBe(
      '<a href="/x?a=1&b=2">Go</a>',
    )
    /* one level only: an escaped code sample stays escaped after decoding */
    expect(decodeEscapedHtml('&lt;p&gt;&amp;lt;br&amp;gt;&lt;/p&gt;')).toBe('<p>&lt;br&gt;</p>')
  })
})
