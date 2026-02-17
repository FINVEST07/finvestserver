import mongoose from "mongoose";
import { Resend } from "resend";

const resend = new Resend(
  process.env.RESEND_API_KEY || "re_ccuAZtfq_qWsMFDrWjLSwX1vt6qm5GFCp"
);

export const SendEnquiry = async (req, res) => {
  try {
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

    const officeemail = "officefinvestcorp@gmail.com";

    const { error } = await resend.emails.send({
      from: "FINVESTCORP <no-reply@t-rexinfotech.in>",
      to: [officeemail],
      subject: `New Enquiry - ${normalizedService} (${normalizedCity})`,
      html: `
        <p>A new enquiry has been submitted.</p>
        <p><strong>Name:</strong> ${normalizedName}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Mobile:</strong> ${normalizedMobile}</p>
        <p><strong>City:</strong> ${normalizedCity}</p>
        <p><strong>Service:</strong> ${normalizedService}</p>
        <p><strong>Amount:</strong> ${normalizedAmount}</p>
        <p><strong>Referral Code:</strong> ${normalizedReferralCode}</p>
        <p><strong>Message:</strong> ${normalizedMessage}</p>
      `,
    });

    if (error) {
      return res.status(500).json({
        message: "Erorr sending enquiry",
        status: false,
      });
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
    console.error(error);

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
