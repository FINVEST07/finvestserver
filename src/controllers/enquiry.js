import mongoose from "mongoose";
import { Resend } from "resend";

const resend = new Resend("re_ccuAZtfq_qWsMFDrWjLSwX1vt6qm5GFCp");

export const SendEnquiry = async (req, res) => {
  try {
    const { firstName, lastName, email, phone, city , service, message } = req.body;

    const officeemail = "officefinvestcorp@gmail.com";

    const { data, error } = await resend.emails.send({
      from: "FINVESTCORP <no-reply@t-rexinfotech.in>",
      to: [officeemail],
      subject: `Enquiry From ${firstName}${lastName} for ${service}, city - ${city}`,
      html: `<p>${message}</p><br><p>Phone - ${phone} , Email - ${email}</p>`,
    });

    if (error) {
      return res.status(500).json({
        message: "Erorr sending enquiry",
        status: false,
      });
    }

    const db = mongoose.connection.db;

    const payload = req.body;
    payload.createdAt = new Date();

    await db.collection("enquiries").insertOne(req.body);



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
