import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';
import html2pdf from 'html2pdf.js';

interface FilePickerAcceptType {
  description: string;
  accept: Record<string, string[]>;
}

async function saveWithPicker(
  blob: Blob,
  suggestedName: string,
  types: FilePickerAcceptType[]
): Promise<boolean> {
  if (!('showSaveFilePicker' in window)) return false;
  try {
    const handle = await (window as any).showSaveFilePicker({
      suggestedName,
      types,
    });
    const writable = await handle.createWritable();
    await writable.write(blob);
    await writable.close();
    return true;
  } catch (err: any) {
    if (err?.name === 'AbortError') return true;
    return false;
  }
}

function getDateSlug() {
  return new Date().toISOString().slice(0, 10);
}

function htmlToPlainText(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function parseHtmlToParagraphs(html: string): Paragraph[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');
  const paragraphs: Paragraph[] = [];

  function getAlignment(el: Element): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
    const style = el.getAttribute('style') || '';
    if (style.includes('text-align: center')) return AlignmentType.CENTER;
    if (style.includes('text-align: right')) return AlignmentType.RIGHT;
    if (style.includes('text-align: justify')) return AlignmentType.JUSTIFIED;
    return undefined;
  }

  function extractRuns(node: Node): TextRun[] {
    const runs: TextRun[] = [];

    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent || '';
      if (text) {
        runs.push(new TextRun({ text, font: 'Calibri', size: 22 }));
      }
      return runs;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return runs;

    const el = node as Element;
    const tag = el.tagName.toLowerCase();

    const childRuns: TextRun[] = [];
    for (const child of Array.from(el.childNodes)) {
      childRuns.push(...extractRuns(child));
    }

    if (tag === 'strong' || tag === 'b') {
      return childRuns.map(r => {
        const opts = { ...getRunOptions(r), bold: true };
        return new TextRun(opts);
      });
    }
    if (tag === 'em' || tag === 'i') {
      return childRuns.map(r => {
        const opts = { ...getRunOptions(r), italics: true };
        return new TextRun(opts);
      });
    }
    if (tag === 'u') {
      return childRuns.map(r => {
        const opts = { ...getRunOptions(r), underline: { type: 'single' as const } };
        return new TextRun(opts);
      });
    }
    if (tag === 's' || tag === 'strike' || tag === 'del') {
      return childRuns.map(r => {
        const opts = { ...getRunOptions(r), strike: true };
        return new TextRun(opts);
      });
    }
    if (tag === 'mark') {
      return childRuns.map(r => {
        const opts = { ...getRunOptions(r), highlight: 'yellow' as const };
        return new TextRun(opts);
      });
    }

    return childRuns;
  }

  function getRunOptions(run: TextRun): Record<string, unknown> {
    const props = (run as any).properties || {};
    const root = (run as any).root || [];
    let text = '';
    if (root.length > 1 && typeof root[1] === 'string') {
      text = root[1];
    } else {
      for (const item of root) {
        if (typeof item === 'string') {
          text = item;
          break;
        }
      }
    }
    return {
      text,
      font: 'Calibri',
      size: 22,
      bold: props.bold,
      italics: props.italics,
      underline: props.underline,
      strike: props.strike,
      highlight: props.highlight,
    };
  }

  function processNode(node: Element, listLevel = 0) {
    const tag = node.tagName.toLowerCase();
    const align = getAlignment(node);

    if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
      const level = tag === 'h1' ? HeadingLevel.HEADING_1 : tag === 'h2' ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
      paragraphs.push(
        new Paragraph({
          children: extractRuns(node),
          heading: level,
          alignment: align,
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (tag === 'p') {
      const runs = extractRuns(node);
      if (runs.length === 0) {
        paragraphs.push(new Paragraph({ spacing: { after: 80 } }));
      } else {
        paragraphs.push(
          new Paragraph({
            children: runs,
            alignment: align,
            spacing: { after: 80 },
          })
        );
      }
    } else if (tag === 'ul' || tag === 'ol') {
      for (const child of Array.from(node.children)) {
        if (child.tagName.toLowerCase() === 'li') {
          processListItem(child, tag, listLevel);
        }
      }
    } else if (tag === 'hr') {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: '_______________________________________________', font: 'Calibri', size: 22, color: 'CCCCCC' })],
          spacing: { before: 120, after: 120 },
        })
      );
    } else if (tag === 'blockquote') {
      for (const child of Array.from(node.children)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const runs = extractRuns(child);
          paragraphs.push(
            new Paragraph({
              children: runs.map(r => {
                const opts = { ...getRunOptions(r), italics: true };
                return new TextRun(opts);
              }),
              indent: { left: 720 },
              spacing: { after: 80 },
            })
          );
        }
      }
    } else {
      for (const child of Array.from(node.children)) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          processNode(child as Element, listLevel);
        }
      }
    }
  }

  function processListItem(li: Element, listType: string, level: number) {
    const directRuns: TextRun[] = [];
    const nestedLists: Element[] = [];

    for (const child of Array.from(li.childNodes)) {
      if (child.nodeType === Node.ELEMENT_NODE) {
        const childEl = child as Element;
        const childTag = childEl.tagName.toLowerCase();
        if (childTag === 'ul' || childTag === 'ol') {
          nestedLists.push(childEl);
        } else if (childTag === 'p') {
          directRuns.push(...extractRuns(childEl));
        } else {
          directRuns.push(...extractRuns(childEl));
        }
      } else if (child.nodeType === Node.TEXT_NODE) {
        const text = child.textContent || '';
        if (text.trim()) {
          directRuns.push(new TextRun({ text, font: 'Calibri', size: 22 }));
        }
      }
    }

    if (directRuns.length > 0) {
      if (listType === 'ul') {
        paragraphs.push(
          new Paragraph({
            children: directRuns,
            bullet: { level },
            spacing: { after: 60 },
          })
        );
      } else {
        paragraphs.push(
          new Paragraph({
            children: directRuns,
            numbering: { reference: 'default-numbering', level },
            spacing: { after: 60 },
          })
        );
      }
    }

    for (const nestedList of nestedLists) {
      const nestedTag = nestedList.tagName.toLowerCase();
      for (const nestedLi of Array.from(nestedList.children)) {
        if (nestedLi.tagName.toLowerCase() === 'li') {
          processListItem(nestedLi, nestedTag, level + 1);
        }
      }
    }
  }

  for (const child of Array.from(doc.body.children)) {
    processNode(child as Element);
  }

  if (paragraphs.length === 0) {
    const text = doc.body.textContent || '';
    if (text.trim()) {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: text.trim(), font: 'Calibri', size: 22 })],
        })
      );
    }
  }

  return paragraphs;
}

export async function exportToDocx(html: string, filename?: string) {
  const paragraphs = parseHtmlToParagraphs(html);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            { level: 0, format: 'decimal' as const, text: '%1.', alignment: AlignmentType.START },
            { level: 1, format: 'lowerLetter' as const, text: '%2.', alignment: AlignmentType.START },
            { level: 2, format: 'lowerRoman' as const, text: '%3.', alignment: AlignmentType.START },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const name = filename || `document-${getDateSlug()}.docx`;
  const saved = await saveWithPicker(blob, name, [
    { description: 'Word Document', accept: { 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'] } },
  ]);
  if (!saved) {
    saveAs(blob, name);
  }
}

export async function exportToPdf(html: string, filename?: string) {
  const container = document.createElement('div');
  container.style.cssText = 'position:absolute;left:-9999px;top:0;width:700px;';
  container.innerHTML = `
    <div style="
      font-family: 'Segoe UI', Calibri, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1e293b;
    ">
      <style>
        .pdf-export h1 { font-size: 18pt; margin: 16pt 0 8pt; color: #0f172a; font-weight: 700; }
        .pdf-export h2 { font-size: 14pt; margin: 14pt 0 6pt; color: #1e293b; font-weight: 600; }
        .pdf-export h3 { font-size: 12pt; margin: 12pt 0 4pt; color: #334155; font-weight: 600; }
        .pdf-export p { margin: 0 0 8pt; }
        .pdf-export ul, .pdf-export ol { margin: 4pt 0 8pt 20pt; }
        .pdf-export li { margin-bottom: 4pt; }
        .pdf-export mark { background-color: #fef08a; padding: 0 2px; }
        .pdf-export blockquote { border-left: 3px solid #cbd5e1; margin: 8pt 0; padding: 4pt 0 4pt 12pt; color: #475569; }
        .pdf-export hr { border: none; border-top: 1px solid #e2e8f0; margin: 12pt 0; }
      </style>
      <div class="pdf-export">${html}</div>
    </div>
  `;
  document.body.appendChild(container);

  try {
    const name = filename || `document-${getDateSlug()}.pdf`;
    const blob: Blob = await html2pdf()
      .set({
        margin: [15, 15, 15, 15],
        filename: name,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      })
      .from(container.firstElementChild)
      .outputPdf('blob');

    const saved = await saveWithPicker(blob, name, [
      { description: 'PDF Document', accept: { 'application/pdf': ['.pdf'] } },
    ]);
    if (!saved) {
      saveAs(blob, name);
    }
  } finally {
    document.body.removeChild(container);
  }
}

export async function exportToTxt(html: string, filename?: string) {
  const plainText = htmlToPlainText(html);
  const blob = new Blob([plainText], { type: 'text/plain' });
  const name = filename || `document-${getDateSlug()}.txt`;
  const saved = await saveWithPicker(blob, name, [
    { description: 'Text File', accept: { 'text/plain': ['.txt'] } },
  ]);
  if (!saved) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
