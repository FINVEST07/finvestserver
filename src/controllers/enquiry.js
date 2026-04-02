import mongoose from "mongoose";
import { Resend } from "resend";
import {
  normalizeReceiverNumber,
  sendWhatsappMessage,
  sleep,
} from "../utils/whatsapp.js";

const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const escapeHtml = (value) =>
  String(value ?? "-")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");

const allowedServices = new Set([
  "loan",
  "insurance",
  "mutual_fund",
  "alternate",
  "auction",
]);

const serviceLabels = {
  loan: "Loan",
  insurance: "Insurance",
  mutual_fund: "Mutual Fund",
  alternate: "Alternate Investment",
  auction: "Auction Properties",
};

const normalizeServiceValue = (value) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "investment") return "mutual_fund";
  if (allowedServices.has(normalized)) return normalized;
  return "";
};

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
    const normalizedServiceValue = normalizeServiceValue(service);
    const normalizedService = normalizedServiceValue
      ? serviceLabels[normalizedServiceValue]
      : "-";
    const normalizedAmount = amount || "-";
    const normalizedReferralCode = referralCode || refercode || "-";
    const normalizedMessage = message || "-";

    if (!email) {
      return res.status(400).json({
        message: "Email is required",
        status: false,
      });
    }

    if (!normalizedServiceValue) {
      return res.status(400).json({
        message: "Please select a valid service",
        status: false,
      });
    }

    const instituteName = process.env.INSTITUTE_NAME || "FINVESTCORP";
    const instituteContact = process.env.INSTITUTE_CONTACT || "";
    const adminEmail =
      process.env.ADMIN_NOTIFICATION_EMAIL ||
      process.env.ENQUIRY_ADMIN_EMAIL ||
      "officefinvestcorp@gmail.com";
    const enquiryMailFrom =
      process.env.ENQUIRY_MAIL_FROM ||
      process.env.RESEND_FROM ||
      "FINVESTCORP <no-reply@t-rexinfotech.in>";
    const configuredAdminNumber =
      process.env.ADMIN_WHATSAPP_NUMBER || process.env.INSTITUTE_CONTACT || "";
    const adminNumber = normalizeReceiverNumber(configuredAdminNumber);
    const userNumber = normalizeReceiverNumber(normalizedMobile);

    const db = mongoose.connection.db;

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

    const adminEmailSubject = `New Enquiry (${instituteName})`;
    const adminEmailHtml = `
      <p>A new enquiry has been received.</p>
      <p><strong>Name:</strong> ${escapeHtml(normalizedName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Mobile:</strong> ${escapeHtml(normalizedMobile)}</p>
      <p><strong>City:</strong> ${escapeHtml(normalizedCity)}</p>
      <p><strong>Service:</strong> ${escapeHtml(normalizedService)}</p>
      <p><strong>Amount:</strong> ${escapeHtml(normalizedAmount)}</p>
      <p><strong>Referral Code:</strong> ${escapeHtml(normalizedReferralCode)}</p>
      <p><strong>Message:</strong> ${escapeHtml(normalizedMessage)}</p>
    `;

    const userEmailSubject = `${instituteName} Enquiry Received`;
    const userEmailHtml = `
      <p>Hi ${escapeHtml(normalizedName)},</p>
      <p>We have received your enquiry at ${escapeHtml(instituteName)}. Here are the details you shared:</p>
      <p><strong>Name:</strong> ${escapeHtml(normalizedName)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Mobile:</strong> ${escapeHtml(normalizedMobile)}</p>
      <p><strong>City:</strong> ${escapeHtml(normalizedCity)}</p>
      <p><strong>Service:</strong> ${escapeHtml(normalizedService)}</p>
      <p><strong>Amount:</strong> ${escapeHtml(normalizedAmount)}</p>
      <p><strong>Referral Code:</strong> ${escapeHtml(normalizedReferralCode)}</p>
      <p><strong>Message:</strong> ${escapeHtml(normalizedMessage)}</p>
      <p>Our team will get back to you shortly.</p>
      ${instituteContact ? `<p>Contact: ${escapeHtml(instituteContact)}</p>` : ""}
    `;

    const payload = {
      name: normalizedName,
      email,
      mobile: normalizedMobile,
      city: normalizedCity,
      service: normalizedService,
      serviceValue: normalizedServiceValue,
      amount: normalizedAmount,
      referralCode: normalizedReferralCode,
      message: normalizedMessage,
      createdAt: new Date(),
      notifications: {
        adminWhatsapp: {
          attempted: false,
          sent: false,
          reason: "",
        },
        userWhatsapp: {
          attempted: false,
          sent: false,
          reason: "",
        },
        adminEmail: {
          attempted: false,
          sent: false,
          reason: "",
        },
        userEmail: {
          attempted: false,
          sent: false,
          reason: "",
        },
      },
    };

    const inserted = await db.collection("enquiries").insertOne(payload);

    const notificationState = {
      adminWhatsapp: {
        attempted: false,
        sent: false,
        reason: "",
      },
      userWhatsapp: {
        attempted: false,
        sent: false,
        reason: "",
      },
      adminEmail: {
        attempted: false,
        sent: false,
        reason: "",
      },
      userEmail: {
        attempted: false,
        sent: false,
        reason: "",
      },
    };

    if (adminNumber) {
      console.log("[SendEnquiry] Sending admin WhatsApp message");
      notificationState.adminWhatsapp.attempted = true;
      try {
        await sendWhatsappMessage({
          number: adminNumber,
          message: adminMessage,
        });
        notificationState.adminWhatsapp.sent = true;
        console.log("[SendEnquiry] Admin WhatsApp message sent");
      } catch (err) {
        notificationState.adminWhatsapp.reason =
          err?.message || "admin_whatsapp_send_failed";
        console.error("[SendEnquiry] Failed to send admin WhatsApp message:", err);
      }
    } else {
      notificationState.adminWhatsapp.reason =
        "ADMIN_WHATSAPP_NUMBER is missing/invalid";
      console.error("[SendEnquiry] ADMIN_WHATSAPP_NUMBER is missing/invalid");
    }

    if (!resend) {
      notificationState.adminEmail.reason = "RESEND_API_KEY is missing; skipping admin email";
      notificationState.userEmail.reason = "RESEND_API_KEY is missing; skipping user email";
      console.error("[SendEnquiry] RESEND_API_KEY is missing; email notifications skipped");
    } else {
      if (adminEmail) {
        notificationState.adminEmail.attempted = true;
        try {
          const adminMailResult = await resend.emails.send({
            from: enquiryMailFrom,
            to: [adminEmail],
            subject: adminEmailSubject,
            html: adminEmailHtml,
          });

          if (adminMailResult?.error) {
            throw new Error(adminMailResult.error.message || "admin_email_send_failed");
          }

          notificationState.adminEmail.sent = true;
          console.log("[SendEnquiry] Admin email sent");
        } catch (err) {
          notificationState.adminEmail.reason = err?.message || "admin_email_send_failed";
          console.error("[SendEnquiry] Failed to send admin email:", err);
        }
      } else {
        notificationState.adminEmail.reason =
          "ADMIN_NOTIFICATION_EMAIL / ENQUIRY_ADMIN_EMAIL is missing";
        console.error(
          "[SendEnquiry] ADMIN_NOTIFICATION_EMAIL / ENQUIRY_ADMIN_EMAIL is missing"
        );
      }

      notificationState.userEmail.attempted = true;
      try {
        const userMailResult = await resend.emails.send({
          from: enquiryMailFrom,
          to: [email],
          subject: userEmailSubject,
          html: userEmailHtml,
        });

        if (userMailResult?.error) {
          throw new Error(userMailResult.error.message || "user_email_send_failed");
        }

        notificationState.userEmail.sent = true;
        console.log("[SendEnquiry] User confirmation email sent");
      } catch (err) {
        notificationState.userEmail.reason = err?.message || "user_email_send_failed";
        console.error("[SendEnquiry] Failed to send user confirmation email:", err);
      }
    }

    if (userNumber) {
      const userMessage =
        `Hi ${normalizedName},\n\n` +
        `We have received your enquiry at ${instituteName}. Here are the details you shared:\n\n` +
        `Name: ${normalizedName}\n` +
        `Email: ${email}\n` +
        `Mobile: ${normalizedMobile}\n` +
        `City: ${normalizedCity}\n` +
        `Service: ${normalizedService}\n` +
        `Amount: ${normalizedAmount}\n` +
        `Referral Code: ${normalizedReferralCode}\n\n` +
        `Our team will get back to you shortly.\n\n` +
        (instituteContact ? `Contact: ${instituteContact}` : "");

      console.log("[SendEnquiry] Sending user WhatsApp confirmation");
      notificationState.userWhatsapp.attempted = true;
      try {
        await sleep(400);
        await sendWhatsappMessage({
          number: userNumber,
          message: userMessage,
        });
        notificationState.userWhatsapp.sent = true;
        console.log("[SendEnquiry] User WhatsApp confirmation sent");
      } catch (err) {
        notificationState.userWhatsapp.reason =
          err?.message || "user_whatsapp_send_failed";
        console.error(
          "[SendEnquiry] Failed to send user WhatsApp confirmation (continuing):",
          err
        );
      }
    } else {
      notificationState.userWhatsapp.reason =
        "User number invalid/missing; skipping user WhatsApp confirmation";
      console.log(
        "[SendEnquiry] User number invalid/missing; skipping user WhatsApp confirmation"
      );
    }

    await db.collection("enquiries").updateOne(
      { _id: inserted.insertedId },
      {
        $set: {
          notifications: notificationState,
          notificationUpdatedAt: new Date(),
        },
      }
    );

    const adminSent = notificationState.adminWhatsapp.sent;
    const userSent = notificationState.userWhatsapp.sent;
    const adminEmailSent = notificationState.adminEmail.sent;
    const userEmailSent = notificationState.userEmail.sent;
    const responsePayload = {
      status: true,
      saved: true,
      message: "Enquiry submitted successfully.",
      notifications: {
        adminWhatsapp: adminSent,
        userWhatsapp: userSent,
        adminEmail: adminEmailSent,
        userEmail: userEmailSent,
      },
      notificationReasons: {
        adminWhatsapp: notificationState.adminWhatsapp.reason || "",
        userWhatsapp: notificationState.userWhatsapp.reason || "",
        adminEmail: notificationState.adminEmail.reason || "",
        userEmail: notificationState.userEmail.reason || "",
      },
    };

    if (!adminSent && !adminEmailSent) {
      responsePayload.message =
        "Enquiry saved, but admin notifications could not be delivered right now.";
      return res.status(202).json(responsePayload);
    }

    if (!userSent && !userEmailSent) {
      responsePayload.message =
        "Enquiry submitted. Confirmation to your number/email could not be delivered.";
    }

    return res.status(200).json(responsePayload);
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
