import html2canvas from "html2canvas";
import jsPDF from "jspdf";

interface ExportPDFOptions {
  elementId: string;
  fileName: string;
  title?: string;
}

export async function exportToPDF({ elementId, fileName, title }: ExportPDFOptions): Promise<void> {
  const element = document.getElementById(elementId);
  if (!element) {
    console.warn(`exportToPDF: elemento "${elementId}" não encontrado.`);
    return;
  }

  const canvas = await html2canvas(element, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#F2F2F2",
    logging: false,
  });

  const imgData = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  const pageWidth  = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin     = 10;
  const contentW   = pageWidth - margin * 2;

  // Header strip
  pdf.setFillColor(40, 7, 28);
  pdf.rect(0, 0, pageWidth, 14, "F");
  pdf.setTextColor(246, 243, 170);
  pdf.setFontSize(10);
  pdf.text("Fashion Mind", margin, 9);
  if (title) {
    pdf.setTextColor(246, 243, 170);
    pdf.setFontSize(8);
    pdf.text(title, pageWidth / 2, 9, { align: "center" });
  }
  pdf.setFontSize(7);
  pdf.setTextColor(246, 243, 170);
  pdf.text(
    `Gerado em ${new Date().toLocaleString("pt-BR")}`,
    pageWidth - margin,
    9,
    { align: "right" },
  );

  // Content image, scaled to fit page width
  const imgH = (canvas.height / canvas.width) * contentW;
  const startY = 18;

  if (imgH <= pageHeight - startY - margin) {
    pdf.addImage(imgData, "PNG", margin, startY, contentW, imgH);
  } else {
    // Multi-page: slice canvas into page-sized chunks
    const sliceH = Math.floor(canvas.width * (pageHeight - startY - margin) / contentW);
    let srcY = 0;
    let isFirstPage = true;

    while (srcY < canvas.height) {
      if (!isFirstPage) {
        pdf.addPage();
        pdf.setFillColor(40, 7, 28);
        pdf.rect(0, 0, pageWidth, 14, "F");
        pdf.setTextColor(246, 243, 170);
        pdf.setFontSize(10);
        pdf.text("Fashion Mind", margin, 9);
      }

      const sliceCanvas = document.createElement("canvas");
      const remaining   = Math.min(sliceH, canvas.height - srcY);
      sliceCanvas.width  = canvas.width;
      sliceCanvas.height = remaining;
      const ctx = sliceCanvas.getContext("2d")!;
      ctx.drawImage(canvas, 0, srcY, canvas.width, remaining, 0, 0, canvas.width, remaining);

      const sliceImg  = sliceCanvas.toDataURL("image/png");
      const sliceImgH = (remaining / canvas.width) * contentW;
      pdf.addImage(sliceImg, "PNG", margin, isFirstPage ? startY : 18, contentW, sliceImgH);

      srcY += sliceH;
      isFirstPage = false;
    }
  }

  pdf.save(`${fileName}.pdf`);
}
