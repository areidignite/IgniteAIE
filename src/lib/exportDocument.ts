import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import { saveAs } from 'file-saver';

function getDateSlug() {
  return new Date().toISOString().slice(0, 10);
}

function parseContentToParagraphs(content: string): Paragraph[] {
  const lines = content.split('\n');
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      paragraphs.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    const h1Match = trimmed.match(/^#\s+(.+)/);
    const h2Match = trimmed.match(/^##\s+(.+)/);
    const h3Match = trimmed.match(/^###\s+(.+)/);
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);

    if (h1Match) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(h1Match[1]),
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 240, after: 120 },
        })
      );
    } else if (h2Match) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(h2Match[1]),
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        })
      );
    } else if (h3Match) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(h3Match[1]),
          heading: HeadingLevel.HEADING_3,
          spacing: { before: 160, after: 80 },
        })
      );
    } else if (bulletMatch) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(bulletMatch[1]),
          bullet: { level: 0 },
          spacing: { after: 60 },
        })
      );
    } else if (numberedMatch) {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(numberedMatch[2]),
          numbering: { reference: 'default-numbering', level: 0 },
          spacing: { after: 60 },
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: parseInlineFormatting(trimmed),
          spacing: { after: 80 },
        })
      );
    }
  }

  return paragraphs;
}

function parseInlineFormatting(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|([^*]+))/g;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match[2]) {
      runs.push(new TextRun({ text: match[2], bold: true, italics: true, font: 'Calibri', size: 22 }));
    } else if (match[3]) {
      runs.push(new TextRun({ text: match[3], bold: true, font: 'Calibri', size: 22 }));
    } else if (match[4]) {
      runs.push(new TextRun({ text: match[4], italics: true, font: 'Calibri', size: 22 }));
    } else if (match[5]) {
      runs.push(new TextRun({ text: match[5], font: 'Calibri', size: 22 }));
    }
  }

  if (runs.length === 0) {
    runs.push(new TextRun({ text, font: 'Calibri', size: 22 }));
  }

  return runs;
}

export async function exportToDocx(content: string, filename?: string) {
  const paragraphs = parseContentToParagraphs(content);

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'default-numbering',
          levels: [
            {
              level: 0,
              format: 'decimal' as const,
              text: '%1.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440,
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: paragraphs,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, filename || `document-${getDateSlug()}.docx`);
}

export function exportToPdf(content: string) {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const htmlContent = contentToHtml(content);

  printWindow.document.write(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Document Export</title>
      <style>
        @page { margin: 1in; }
        body {
          font-family: 'Segoe UI', Calibri, Arial, sans-serif;
          font-size: 11pt;
          line-height: 1.6;
          color: #1e293b;
          max-width: 100%;
          margin: 0;
          padding: 0;
        }
        h1 { font-size: 18pt; margin: 16pt 0 8pt; color: #0f172a; }
        h2 { font-size: 14pt; margin: 14pt 0 6pt; color: #1e293b; }
        h3 { font-size: 12pt; margin: 12pt 0 4pt; color: #334155; }
        p { margin: 0 0 8pt; }
        ul, ol { margin: 4pt 0 8pt 20pt; }
        li { margin-bottom: 4pt; }
        @media print {
          body { -webkit-print-color-adjust: exact; }
        }
      </style>
    </head>
    <body>${htmlContent}</body>
    </html>
  `);
  printWindow.document.close();

  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 250);
  };
}

function contentToHtml(content: string): string {
  const lines = content.split('\n');
  const htmlParts: string[] = [];
  let inList: 'ul' | 'ol' | null = null;

  const escapeHtml = (str: string) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const formatInline = (text: string) => {
    return escapeHtml(text)
      .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>');
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '') {
      if (inList) {
        htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      continue;
    }

    const h1Match = trimmed.match(/^#\s+(.+)/);
    const h2Match = trimmed.match(/^##\s+(.+)/);
    const h3Match = trimmed.match(/^###\s+(.+)/);
    const bulletMatch = trimmed.match(/^[-*]\s+(.+)/);
    const numberedMatch = trimmed.match(/^(\d+)[.)]\s+(.+)/);

    if (h1Match || h2Match || h3Match) {
      if (inList) {
        htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
    }

    if (h1Match) {
      htmlParts.push(`<h1>${formatInline(h1Match[1])}</h1>`);
    } else if (h2Match) {
      htmlParts.push(`<h2>${formatInline(h2Match[1])}</h2>`);
    } else if (h3Match) {
      htmlParts.push(`<h3>${formatInline(h3Match[1])}</h3>`);
    } else if (bulletMatch) {
      if (inList !== 'ul') {
        if (inList) htmlParts.push('</ol>');
        htmlParts.push('<ul>');
        inList = 'ul';
      }
      htmlParts.push(`<li>${formatInline(bulletMatch[1])}</li>`);
    } else if (numberedMatch) {
      if (inList !== 'ol') {
        if (inList) htmlParts.push('</ul>');
        htmlParts.push('<ol>');
        inList = 'ol';
      }
      htmlParts.push(`<li>${formatInline(numberedMatch[2])}</li>`);
    } else {
      if (inList) {
        htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
        inList = null;
      }
      htmlParts.push(`<p>${formatInline(trimmed)}</p>`);
    }
  }

  if (inList) {
    htmlParts.push(inList === 'ul' ? '</ul>' : '</ol>');
  }

  return htmlParts.join('\n');
}

export function exportToTxt(content: string, filename?: string) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || `document-${getDateSlug()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
