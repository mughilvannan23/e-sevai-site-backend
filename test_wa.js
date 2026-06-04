require('dotenv').config();
const { sendWhatsAppDocument } = require('./utils/whatsappUtil');
const fs = require('fs');
const path = require('path');

async function test() {
  try {
    const testPdfPath = path.join(__dirname, 'test.pdf');
    fs.writeFileSync(testPdfPath, 'dummy pdf content');
    
    // Attempt to send to admin mobile
    await sendWhatsAppDocument(process.env.ADMIN_MOBILE || '919360945103', testPdfPath, 'test.pdf');
    console.log("Success!");
  } catch (error) {
    console.error("FAILED");
    if (error.response) {
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}
test();
