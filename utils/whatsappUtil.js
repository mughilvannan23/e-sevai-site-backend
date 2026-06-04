const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const sendWhatsAppDocument = async (to, filePath, filename) => {
  try {
    const token = process.env.WHATSAPP_TOKEN;
    const phoneNumberId = process.env.WHATSAPP_PHONE_ID;
    
    if (!token || !phoneNumberId) {
      console.warn("WhatsApp credentials not configured.");
      return false;
    }

    // format phone number (ensure country code)
    let phone = to.replace(/\D/g, '');
    if (phone.length === 10) {
      phone = '91' + phone; // Add India code if 10 digits
    }

    // Step 1: Upload the file to WhatsApp Media API
    const formData = new FormData();
    formData.append('messaging_product', 'whatsapp');
    formData.append('file', fs.createReadStream(filePath), { filename: filename, contentType: 'application/pdf' });

    console.log("Uploading media to WhatsApp...");
    const uploadRes = await axios.post(
      `https://graph.facebook.com/v17.0/${phoneNumberId}/media`,
      formData,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          ...formData.getHeaders()
        }
      }
    );

    const mediaId = uploadRes.data.id;
    if (!mediaId) {
      throw new Error("Failed to get media ID from WhatsApp");
    }
    console.log("Media uploaded successfully, ID:", mediaId);

    // Step 2: Send the message using the media ID
    const payload = {
      messaging_product: "whatsapp",
      to: phone,
      type: "document",
      document: {
        id: mediaId,
        filename: filename
      }
    };

    console.log("Sending WhatsApp message...");
    const response = await axios.post(
      `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return response.data;
  } catch (error) {
    let errMsg = error.message;
    if (error.response && error.response.data && error.response.data.error) {
      errMsg = error.response.data.error.message || JSON.stringify(error.response.data.error);
    }
    console.error('WhatsApp API Error:', errMsg);
    throw new Error(errMsg);
  }
};

module.exports = { sendWhatsAppDocument };
