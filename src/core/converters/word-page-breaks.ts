import JSZip from 'jszip';

/**
 * Count Word's own pagination markers in document.xml.
 * `lastRenderedPageBreak` is written by Word when the file was last laid out —
 * those are the authoritative page breaks for Exact view.
 */
export async function countWordLayoutBreaks(data: ArrayBuffer): Promise<{
  lastRenderedPageBreaks: number;
  explicitPageBreaks: number;
  /** Approximate Word page count from markers (breaks + 1). */
  estimatedPages: number;
}> {
  try {
    const zip = await JSZip.loadAsync(data.slice(0));
    const xml = await zip.file('word/document.xml')?.async('string');
    if (!xml) {
      return { lastRenderedPageBreaks: 0, explicitPageBreaks: 0, estimatedPages: 0 };
    }

    const lastRenderedPageBreaks = (xml.match(/lastRenderedPageBreak/g) || []).length;
    // Explicit page breaks: <w:br w:type="page"/> or <w:pageBreakBefore/>
    const brPage = (xml.match(/w:type\s*=\s*["']page["']/g) || []).length;
    const pageBreakBefore = (xml.match(/pageBreakBefore/g) || []).length;
    const explicitPageBreaks = brPage + pageBreakBefore;

    const breaks = lastRenderedPageBreaks + explicitPageBreaks;
    return {
      lastRenderedPageBreaks,
      explicitPageBreaks,
      estimatedPages: breaks > 0 ? breaks + 1 : 0,
    };
  } catch {
    return { lastRenderedPageBreaks: 0, explicitPageBreaks: 0, estimatedPages: 0 };
  }
}
