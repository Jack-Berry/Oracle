import {
  PDFDocument,
  PDFTextField,
  PDFCheckBox,
  PDFRadioGroup,
  PDFDropdown,
} from 'pdf-lib';

/**
 * @param {File} file
 * @returns {Promise<Record<string, string|boolean>>}
 *   All form field names and their current values.
 *   Returns an empty object if the PDF has no form fields.
 */
export async function extractPdfFormFields(file) {
  const buffer = await file.arrayBuffer();

  let pdfDoc;
  try {
    pdfDoc = await PDFDocument.load(new Uint8Array(buffer), {
      ignoreEncryption: true,
      updateMetadata: false,
    });
  } catch (err) {
    throw new Error(`Could not read PDF: ${err.message}`);
  }

  let form;
  try {
    form = pdfDoc.getForm();
  } catch {
    return {};
  }

  const fields = form.getFields();
  if (fields.length === 0) return {};

  const raw = {};

  for (const field of fields) {
    const name = field.getName();
    try {
      if (field instanceof PDFTextField) {
        raw[name] = field.getText() ?? '';
      } else if (field instanceof PDFCheckBox) {
        raw[name] = field.isChecked();
      } else if (field instanceof PDFRadioGroup) {
        raw[name] = field.getSelected() ?? '';
      } else if (field instanceof PDFDropdown) {
        raw[name] = field.getSelected() ?? '';
      }
    } catch {
      // Some encrypted or malformed fields throw — skip them
    }
  }

  return raw;
}

async function getPdfjsLib() {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url,
  ).href;
  return pdfjsLib;
}

/**
 * Uses pdfjs-dist Widget annotations to read form field values.
 * Covers cases where pdf-lib's getFields() returns empty but the PDF
 * does have AcroForm Widget annotations (common in D&D Beyond 2024 PDFs).
 *
 * @param {File} file
 * @returns {Promise<{ raw: Record<string, string|boolean>, allWidgets: object[] }>}
 */
export async function extractPdfAnnotationFields(file) {
  const buffer  = await file.arrayBuffer();
  const pdfjsLib = await getPdfjsLib();
  const pdf     = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const raw = {};
  const allWidgets = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page        = await pdf.getPage(p);
    const annotations = await page.getAnnotations();
    for (const ann of annotations) {
      if (ann.subtype !== 'Widget') continue;
      allWidgets.push({
        fieldName:  ann.fieldName  ?? '(unnamed)',
        fieldType:  ann.fieldType  ?? '?',
        fieldValue: ann.fieldValue ?? '',
      });
      if (!ann.fieldName) continue;
      // fieldValue for text/choice; buttonValue for checkboxes
      const val = ann.fieldValue ?? ann.buttonValue;
      if (val !== undefined && val !== null && val !== '') {
        raw[ann.fieldName] = val;
      }
    }
  }

  return { raw, allWidgets };
}

/**
 * Extracts all visible text from a PDF using pdfjs-dist, sorted top-to-bottom.
 * Last resort — only reliable when field values are rendered into the content stream
 * rather than stored in Widget annotations.
 *
 * @param {File} file
 * @returns {Promise<string>}
 */
export async function extractPdfText(file) {
  const buffer   = await file.arrayBuffer();
  const pdfjsLib = await getPdfjsLib();
  const pdf      = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

  const pageTexts = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page    = await pdf.getPage(p);
    const content = await page.getTextContent();

    // Sort items top-to-bottom, left-to-right by transform origin
    const items = content.items
      .filter(i => i.str)
      .sort((a, b) => {
        const ay = a.transform[5], by2 = b.transform[5];
        if (Math.abs(ay - by2) > 2) return by2 - ay; // higher Y = higher on page
        return a.transform[4] - b.transform[4];
      })
      .map(i => i.str.trim())
      .filter(Boolean);

    pageTexts.push(items.join('\n'));
  }

  return pageTexts.join('\n\n').trim();
}
