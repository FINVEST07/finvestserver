import mongoose from "mongoose";
import {
  normalizeReceiverNumber,
  sendWhatsappMessage,
  sleep,
} from "../utils/whatsapp.js";

export const SendEnquiry = async (req, res) => {
  try {
    console.log("[SendEnquiry] Received enquiry");

    const {
      name,
      email,
      mobile,
      city,
      service,
      amount,
      referralCode,
      refercode,
      firstName,
      lastName,
      phone,
      message,
    } = req.body;

    const normalizedName =
      name || [firstName, lastName].filter(Boolean).join(" ") || "-";
    const normalizedMobile = mobile || phone || "-";
    const normalizedCity = city || "-";
    const normalizedService = service || "-";
    const normalizedAmount = amount || "-";
    const normalizedReferralCode = referralCode || refercode || "-";
    const normalizedMessage = message || "-";

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        status: false,
      });
    }

    const instituteName = process.env.INSTITUTE_NAME || "FINVESTCORP";
    const instituteContact = process.env.INSTITUTE_CONTACT || "";
    const adminNumber = normalizeReceiverNumber(process.env.ADMIN_WHATSAPP_NUMBER);
    const userNumber = normalizeReceiverNumber(normalizedMobile);

    if (!adminNumber) {
      console.error("[SendEnquiry] ADMIN_WHATSAPP_NUMBER is missing/invalid");
      return res.status(500).json({
        message: "Erorr sending enquiry",
        status: false,
      });
    }

    const adminMessage =
      `New Enquiry (${instituteName})\n\n` +
      `Name: ${normalizedName}\n` +
      `Email: ${email}\n` +
      `Mobile: ${normalizedMobile}\n` +
      `City: ${normalizedCity}\n` +
      `Service: ${normalizedService}\n` +
      `Amount: ${normalizedAmount}\n` +
      `Referral Code: ${normalizedReferralCode}\n` +
      `Message: ${normalizedMessage}`;

    console.log("[SendEnquiry] Sending admin WhatsApp message");
    try {
      await sendWhatsappMessage({
        number: adminNumber,
        message: adminMessage,
      });
      console.log("[SendEnquiry] Admin WhatsApp message sent");
    } catch (err) {
      console.error("[SendEnquiry] Failed to send admin WhatsApp message:", err);
      return res.status(500).json({
        message: "Erorr sending enquiry",
        status: false,
      });
    }

    if (userNumber) {
      const userMessage =
        `Hi ${normalizedName},\n\n` +
        `We have received your enquiry at ${instituteName}. Our team will get back to you shortly.\n\n` +
        (instituteContact ? `Contact: ${instituteContact}` : "");

      console.log("[SendEnquiry] Sending user WhatsApp confirmation");
      try {
        await sleep(400);
        await sendWhatsappMessage({
          number: userNumber,
          message: userMessage,
        });
        console.log("[SendEnquiry] User WhatsApp confirmation sent");
      } catch (err) {
        console.error(
          "[SendEnquiry] Failed to send user WhatsApp confirmation (continuing):",
          err
        );
      }
    } else {
      console.log(
        "[SendEnquiry] User number invalid/missing; skipping user WhatsApp confirmation"
      );
    }

    const db = mongoose.connection.db;

    const payload = {
      name: normalizedName,
      email,
      mobile: normalizedMobile,
      city: normalizedCity,
      service: normalizedService,
      amount: normalizedAmount,
      referralCode: normalizedReferralCode,
      message: normalizedMessage,
      createdAt: new Date(),
    };

    await db.collection("enquiries").insertOne(payload);



    return res.status(200).json({
      message: "Enquiry Send Successfully",
      status: true,
    });
  } catch (error) {
    console.error("[SendEnquiry] Internal error:", error);

    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};

export const GetEnquiries = async (req, res) => {
  try {
    const db = mongoose.connection.db;

    const enquiries = await db
      .collection("enquiries")
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    return res.status(200).json({
      payload: enquiries,
      status: true,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({
      message: "Internal Server Error",
      status: false,
    });
  }
};
