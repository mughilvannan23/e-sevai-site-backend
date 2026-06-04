const PDFDocument = require('pdfkit');
const fs = require('fs');

const generateReceiptPDF = (work, filePath) => {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 30, size: [280, 800] }); 
      
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      
      // Header
      doc.font('Helvetica-Bold').fontSize(14).text('SEVAGAN CSC &', { align: 'center' });
      doc.text('E-SEVA CENTRE', { align: 'center' });
      doc.font('Helvetica').fontSize(10).text('Tiruchirappalli, Tamil Nadu', { align: 'center' });
      
      // Line
      doc.moveTo(30, doc.y + 5).lineTo(250, doc.y + 5).dash(2, { space: 2 }).stroke();
      doc.moveDown(0.5);
      
      // Date and Time
      const dateStr = new Date(work.date).toLocaleDateString('en-IN');
      const timeStr = new Date(work.date).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
      
      doc.font('Helvetica').fontSize(10);
      doc.text(`Date: ${dateStr}`, 30, doc.y, { continued: true });
      doc.text(`Time: ${timeStr}`, { align: 'right' });
      
      doc.moveTo(30, doc.y + 5).lineTo(250, doc.y + 5).dash(2, { space: 2 }).stroke();
      doc.moveDown(0.5);
      
      // Customer
      doc.font('Helvetica-Bold').text('Customer: ', { continued: true });
      doc.font('Helvetica').text(work.customerName);
      
      if (work.customerPhone) {
        doc.font('Helvetica-Bold').text('Phone: ', { continued: true });
        doc.font('Helvetica').text(work.customerPhone);
      }
      
      doc.moveTo(30, doc.y + 5).lineTo(250, doc.y + 5).dash(2, { space: 2 }).stroke();
      doc.moveDown(0.5);
      
      // Headers
      doc.font('Helvetica-Bold');
      doc.text('Description', 30, doc.y, { continued: true });
      doc.text('Amount', { align: 'right' });
      
      doc.moveTo(30, doc.y + 2).lineTo(250, doc.y + 2).dash(2, { space: 2 }).stroke();
      doc.moveDown(0.5);
      
      // Items
      let totalPresetAmount = 0;
      let totalAepsAmount = 0;
      
      if (work.items && work.items.length > 0) {
        work.items.forEach(i => {
          const qty = i.quantity || 1;
          const price = (i.workChargeAtTime || 0) + (i.serviceChargeAtTime || 0);
          const presetAmt = i.presetAmount || 0;
          const otherC = i.otherCharges || 0;
          const itemDiscount = i.discount || 0;
          const isAEPS = i.presetChargeType === 'AEPS';
          const subtotal = (qty * price) + (isAEPS ? 0 : presetAmt) + otherC - itemDiscount;
          
          if (isAEPS) totalAepsAmount += presetAmt;
          else totalPresetAmount += presetAmt;
          
          doc.font('Helvetica-Bold').fontSize(10);
          doc.text(i.title, 30, doc.y, { width: 150, continued: true });
          doc.text(`Rs.${subtotal.toLocaleString()}`, { align: 'right' });
          
          doc.font('Helvetica').fontSize(9);
          if (price > 0) {
            doc.text('Rate: ', { continued: true }).text(`${qty} x Rs.${price} = Rs.${qty * price}`, { align: 'right' });
          }
          if (presetAmt > 0) {
            const chargeLabel = i.presetChargeType && i.presetChargeType !== 'None' ? i.presetChargeType : 'Amt';
            doc.text(`${chargeLabel}: `, { continued: true }).text(`Rs.${presetAmt.toLocaleString()}`, { align: 'right' });
          }
          if (otherC > 0) {
            doc.text('Other: ', { continued: true }).text(`Rs.${otherC.toLocaleString()}`, { align: 'right' });
          }
          if (itemDiscount > 0) {
            doc.text('Discount: ', { continued: true }).text(`-Rs.${itemDiscount.toLocaleString()}`, { align: 'right' });
          }
          if (i.applicationNumber) {
            doc.text('App No: ', { continued: true }).text(i.applicationNumber, { align: 'right' });
          }
          doc.moveDown(0.2);
        });
      }
      
      doc.moveTo(30, doc.y + 5).lineTo(250, doc.y + 5).undash().stroke();
      doc.moveDown(0.5);
      
      // Totals
      doc.font('Helvetica').fontSize(10);
      if (totalPresetAmount > 0) {
        doc.text('Recharge/Transfer Total: ', { continued: true }).text(`Rs.${totalPresetAmount.toLocaleString()}`, { align: 'right' });
      }
      if (work.totalDiscount > 0) {
        doc.text('Total Discount: ', { continued: true }).text(`-Rs.${work.totalDiscount.toLocaleString()}`, { align: 'right' });
      }
      if (totalAepsAmount > 0) {
        doc.text('AEPS Withdrawal: ', { continued: true }).text(`Rs.${totalAepsAmount.toLocaleString()}`, { align: 'right' });
      }
      
      doc.moveDown(0.5);
      doc.font('Helvetica-Bold').fontSize(12);
      doc.text('FINAL PAYABLE', 30, doc.y, { continued: true });
      doc.text(`Rs.${(work.totalAmount || work.amount || 0).toLocaleString()}`, { align: 'right' });
      
      doc.moveTo(30, doc.y + 5).lineTo(250, doc.y + 5).dash(2, { space: 2 }).stroke();
      doc.moveDown(1);
      
      // Footer
      doc.font('Helvetica-Bold').fontSize(10);
      doc.text('Thank You! Visit Again', { align: 'center' });
      
      doc.end();
      
      stream.on('finish', () => resolve(filePath));
      stream.on('error', reject);
    } catch (err) {
      reject(err);
    }
  });
};

module.exports = { generateReceiptPDF };
