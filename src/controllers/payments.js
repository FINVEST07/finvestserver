import mongoose from "mongoose";
import crypto from "crypto";
import Razorpay from "razorpay";
import { Resend } from "resend";
import PromoCode from "../models/promoCode.js";

const resendApiKey = process.env.RESEND_API_KEY || "";
const resend = resendApiKey ? new Resend(resendApiKey) : null;

const formatDateTime = (date) => {
  if (!date) return "-";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const sendInvoiceEmail = async ({ email, planLabel, productLabel, baseAmount, gstAmount, amount, paymentId, orderId, activatedAt, expiresAt }) => {
  if (!resend) {
    console.warn("[sendInvoiceEmail] RESEND_API_KEY not configured; skipping invoice email");
    return { sent: false, reason: "RESEND_API_KEY missing" };
  }

  if (!email) {
    console.warn("[sendInvoiceEmail] No email provided; skipping invoice email");
    return { sent: false, reason: "email missing" };
  }

  const mailFrom = process.env.RESEND_FROM || "FINVESTCORP <no-reply@t-rexinfotech.in>";
  const instituteName = process.env.INSTITUTE_NAME || "FINVESTCORP";
  const instituteContact = process.env.INSTITUTE_CONTACT || "";

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: linear-gradient(135deg, #0F172A, #1E3A5F); padding: 30px; border-radius: 12px 12px 0 0; text-align: center;">
        <h1 style="color: #D4AF37; margin: 0; font-size: 28px;">${instituteName}</h1>
        <p style="color: #93C5FD; margin: 8px 0 0 0; font-size: 14px;">Premium Subscription Invoice</p>
      </div>

      <div style="background: #ffffff; padding: 30px; border: 1px solid #e2e8f0; border-top: none;">
        <p style="color: #1e293b; font-size: 16px;">Dear Customer,</p>
        <p style="color: #475569; font-size: 14px;">Thank you for subscribing to ${instituteName} Premium. Your payment has been successfully processed and your premium subscription is now active.</p>

        <div style="background: #F8FAFC; border-radius: 10px; padding: 20px; margin: 20px 0;">
          <h2 style="color: #0F172A; font-size: 18px; margin: 0 0 16px 0;">Invoice Details</h2>
          <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
            <tr>
              <td style="padding: 8px 0; color: #64748B; width: 40%;">Plan</td>
              <td style="padding: 8px 0; color: #0F172A; font-weight: 600;">${planLabel}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Product</td>
              <td style="padding: 8px 0; color: #0F172A; font-weight: 600;">${productLabel || "All Products"}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Base Price</td>
              <td style="padding: 8px 0; color: #0F172A; font-weight: 600;">₹${Number(baseAmount).toLocaleString("en-IN")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">GST (18%)</td>
              <td style="padding: 8px 0; color: #0F172A; font-weight: 600;">₹${Number(gstAmount).toLocaleString("en-IN")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Total Amount Paid</td>
              <td style="padding: 8px 0; color: #0F172A; font-weight: 600;">₹${Number(amount).toLocaleString("en-IN")}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Activated On</td>
              <td style="padding: 8px 0; color: #0F172A; font-weight: 600;">${formatDateTime(activatedAt)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Valid Until</td>
              <td style="padding: 8px 0; color: #0F172A; font-weight: 600;">${formatDateTime(expiresAt)}</td>
            </tr>
            <tr>
              <td style="padding: 8px 0; color: #64748B;">Status</td>
              <td style="padding: 8px 0;">
                <span style="color: #059669; font-weight: 600;">● Active</span>
              </td>
            </tr>
          </table>
        </div>

        <p style="color: #475569; font-size: 14px;">You now have access to full property details, documents, and premium features across the platform.</p>

        ${instituteContact ? `<p style="color: #64748B; font-size: 13px;">Need help? Contact us at ${instituteContact}</p>` : ""}

        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="color: #94A3B8; font-size: 12px; text-align: center;">This is an automated email. Please do not reply.<br/>© ${new Date().getFullYear()} ${instituteName}. All rights reserved.</p>
      </div>
    </div>
  `;

  try {
    console.log(`[sendInvoiceEmail] Attempting to send invoice to ${email} from ${mailFrom}`);
    const result = await resend.emails.send({
      from: mailFrom,
      to: [email],
      subject: `Premium Subscription Invoice - ${instituteName}`,
      html,
    });

    console.log(`[sendInvoiceEmail] Resend response:`, JSON.stringify(result));

    if (result?.error) {
      throw new Error(result.error.message || "invoice_email_send_failed");
    }

    console.log(`[sendInvoiceEmail] Invoice sent to ${email}, email ID: ${result?.data?.id || "N/A"}`);
    return { sent: true };
  } catch (err) {
    console.error(`[sendInvoiceEmail] Failed to send invoice to ${email}:`, err?.message || err);
    return { sent: false, reason: err?.message || "invoice_email_send_failed" };
  }
};

let _razorpayInstance = null;

const getRazorpay = () => {
  if (_razorpayInstance) return _razorpayInstance;

  const key_id = process.env.RAZORPAY_KEY_ID;
  const key_secret = process.env.RAZORPAY_KEY_SECRET;

  if (!key_id || !key_secret) {
    throw new Error("Razorpay keys not configured");
  }

  _razorpayInstance = new Razorpay({ key_id, key_secret });
  return _razorpayInstance;
};

const GST_RATE = 0.18;

const PLAN_DURATIONS = {
  "1m": { label: "Monthly", durationDays: 30 },
  "3m": { label: "Quarterly", durationDays: 90 },
  "1y": { label: "Yearly", durationDays: 365 },
};

const PRODUCT_PRICES = {
  auction: { "1m": 499900, "3m": 999900, "1y": 2999900 },
  "alternate-investment": { "1m": 499900, "3m": 999900, "1y": 2999900 },
  "new-resale": { "1m": 499900, "3m": 999900, "1y": 2999900 },
  all: { "1m": 499900, "3m": 999900, "1y": 2999900 },
};

const PRODUCT_LABELS = {
  auction: "Auction Property",
  "alternate-investment": "Alternate Investment",
  "new-resale": "New / Resale Property",
  all: "All Products",
};

const getBaseAmount = (product, planId) => {
  return PRODUCT_PRICES[product]?.[planId] || 0;
};

const getPlanTotalAmount = (baseAmount) => {
  const gst = baseAmount * GST_RATE;
  return Math.round(baseAmount + gst);
};

const getPlanGstAmount = (baseAmount) => {
  return baseAmount * GST_RATE;
};

const isPremiumActive = (user) => {
  if (!user || !user.premium) return false;

  const plan = PLAN_DURATIONS[user.premiumPlan];
  if (!plan) return false;

  const activatedAt = user.premiumActivatedAt ? new Date(user.premiumActivatedAt) : null;
  if (!activatedAt) return false;

  const expiry = new Date(activatedAt);
  expiry.setDate(expiry.getDate() + plan.durationDays);

  return new Date() <= expiry;
};

const isProductPremiumActive = (user, product) => {
  if (!user || !user.premiumSubscriptions) return false;
  const subs = Array.isArray(user.premiumSubscriptions) ? user.premiumSubscriptions : [];
  const now = new Date();
  return subs.some((sub) => {
    if (sub.product === product || sub.product === "all") {
      const expiry = new Date(sub.expiresAt);
      return now <= expiry;
    }
    return false;
  });
};

const getActiveProducts = (user) => {
  if (!user || !user.premiumSubscriptions) return [];
  const subs = Array.isArray(user.premiumSubscriptions) ? user.premiumSubscriptions : [];
  const now = new Date();
  const active = [];
  for (const sub of subs) {
    const expiry = new Date(sub.expiresAt);
    if (now <= expiry) {
      active.push(sub.product);
    }
  }
  return active;
};

const computeExpiry = (activatedAt, planId) => {
  const plan = PLAN_DURATIONS[planId];
  if (!plan) return null;
  const expiry = new Date(activatedAt);
  expiry.setDate(expiry.getDate() + plan.durationDays);
  return expiry;
};

export const createOrder = async (req, res) => {
  try {
    const { planId, product, promoCode } = req.body;

    if (!planId || typeof planId !== "string") {
      return res.status(400).json({ status: false, message: "Plan ID is required" });
    }

    if (!product || !PRODUCT_PRICES[product]) {
      return res.status(400).json({ status: false, message: "Valid product is required" });
    }

    const planDuration = PLAN_DURATIONS[planId];
    if (!planDuration) {
      return res.status(400).json({ status: false, message: "Invalid plan selected" });
    }

    const baseAmount = getBaseAmount(product, planId);
    if (!baseAmount) {
      return res.status(400).json({ status: false, message: "Pricing not available for selected product and plan" });
    }

    const email = req.authUser?.email || "";
    if (!email) {
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const db = mongoose.connection.db;

    const user = await db.collection("users").findOne({ email });
    if (user && isProductPremiumActive(user, product)) {
      return res.status(409).json({
        status: false,
        message: `You already have an active premium subscription for ${PRODUCT_LABELS[product]}`,
        premium: true,
        product,
      });
    }

    let rzp;
    try {
      rzp = getRazorpay();
    } catch {
      return res.status(500).json({ status: false, message: "Payment gateway not configured" });
    }

    let totalAmount = getPlanTotalAmount(baseAmount);
    let gstAmount = getPlanGstAmount(baseAmount);
    let discountAmount = 0;
    let appliedPromoCode = null;

    if (promoCode) {
      const promo = await PromoCode.findOne({ code: String(promoCode).toUpperCase().trim() }).lean();
      if (!promo) {
        return res.status(400).json({ status: false, message: "Invalid promo code" });
      }
      if (!promo.isActive) {
        return res.status(400).json({ status: false, message: "This promo code is no longer active" });
      }
      const now = new Date();
      if (promo.startDate && now < new Date(promo.startDate)) {
        return res.status(400).json({ status: false, message: "This promo code is not yet valid" });
      }
      if (promo.endDate && now > new Date(promo.endDate)) {
        return res.status(400).json({ status: false, message: "This promo code has expired" });
      }

      if (promo.discountType === "percentage") {
        discountAmount = Math.round((baseAmount * promo.discountValue) / 100);
      } else {
        discountAmount = promo.discountValue * 100;
      }
      discountAmount = Math.min(discountAmount, baseAmount);

      gstAmount = Math.round(baseAmount * GST_RATE);
      totalAmount = (baseAmount - discountAmount) + gstAmount;
      appliedPromoCode = promo.code;
    }

    const order = await rzp.orders.create({
      amount: totalAmount,
      currency: "INR",
      receipt: `premium_${product}_${planId}_${Date.now()}`,
      notes: {
        planId,
        product,
        planLabel: planDuration.label,
        email,
        userId: String(req.authUser?._id || ""),
        ...(appliedPromoCode ? { promoCode: appliedPromoCode } : {}),
      },
    });

    if (!order || !order.id) {
      return res.status(500).json({ status: false, message: "Failed to create order with payment gateway" });
    }

    await db.collection("orders").insertOne({
      orderId: order.id,
      planId,
      product,
      planLabel: planDuration.label,
      baseAmount,
      gstAmount,
      discountAmount: discountAmount / 100,
      amount: totalAmount,
      currency: "INR",
      email,
      userId: req.authUser?._id || null,
      status: "created",
      createdAt: new Date(),
      ...(appliedPromoCode ? { promoCode: appliedPromoCode } : {}),
    });

    return res.status(200).json({
      status: true,
      order,
      planLabel: planDuration.label,
      productLabel: PRODUCT_LABELS[product],
      keyId: process.env.RAZORPAY_KEY_ID,
      baseAmount,
      gstAmount,
      totalAmount,
    });
  } catch (error) {
    console.error("createOrder error:", error?.message || error);
    return res.status(500).json({ status: false, message: "Failed to create payment order" });
  }
};

export const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, planId, product } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ status: false, message: "Missing payment details" });
    }

    if (!planId || !PLAN_DURATIONS[planId]) {
      return res.status(400).json({ status: false, message: "Invalid or missing plan ID" });
    }

    if (!product || !PRODUCT_PRICES[product]) {
      return res.status(400).json({ status: false, message: "Invalid or missing product" });
    }

    const key_secret = process.env.RAZORPAY_KEY_SECRET;
    if (!key_secret) {
      return res.status(500).json({ status: false, message: "Payment gateway not configured" });
    }

    const db = mongoose.connection.db;
    const email = req.authUser?.email || "";

    if (!email) {
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const existingSub = await db.collection("subscriptions").findOne({
      $or: [
        { orderId: razorpay_order_id },
        { paymentId: razorpay_payment_id },
      ],
    });

    if (existingSub) {
      if (existingSub.email === email && existingSub.status === "active") {
        return res.status(200).json({
          status: true,
          message: "Payment already verified. Premium is active.",
          alreadyVerified: true,
        });
      }
      return res.status(409).json({
        status: false,
        message: "This payment has already been processed by another account",
      });
    }

    const expectedSignature = crypto
      .createHmac("sha256", key_secret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      console.warn(`Signature mismatch for order ${razorpay_order_id}`);
      return res.status(400).json({ status: false, message: "Invalid payment signature" });
    }

    const orderRecord = await db.collection("orders").findOne({ orderId: razorpay_order_id });
    if (orderRecord) {
      if (orderRecord.email !== email) {
        return res.status(403).json({ status: false, message: "Order does not belong to this user" });
      }
      if (orderRecord.planId !== planId) {
        return res.status(400).json({ status: false, message: "Plan ID does not match the order" });
      }
      if (orderRecord.product !== product) {
        return res.status(400).json({ status: false, message: "Product does not match the order" });
      }
    }

    const planDuration = PLAN_DURATIONS[planId];
    const baseAmount = getBaseAmount(product, planId);
    const totalAmount = getPlanTotalAmount(baseAmount);
    const gstAmount = getPlanGstAmount(baseAmount);
    const now = new Date();
    const expiry = computeExpiry(now, planId);

    const subscriptionPayload = {
      email,
      userId: req.authUser?._id || null,
      planId,
      product,
      productLabel: PRODUCT_LABELS[product],
      planLabel: planDuration.label,
      baseAmount: baseAmount / 100,
      gstAmount: gstAmount / 100,
      amount: totalAmount / 100,
      currency: "INR",
      orderId: razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: razorpay_signature,
      status: "active",
      activatedAt: now,
      expiresAt: expiry,
      createdAt: now,
    };

    const insertResult = await db.collection("subscriptions").insertOne(subscriptionPayload);

    if (!insertResult.acknowledged) {
      console.error("Failed to insert subscription record");
      return res.status(500).json({ status: false, message: "Failed to save subscription" });
    }

    const userUpdate = await db
      .collection("users")
      .updateOne(
        { email },
        {
          $set: {
            premium: true,
            premiumPlan: planId,
            premiumActivatedAt: now,
            premiumExpiresAt: expiry,
          },
          $push: {
            premiumSubscriptions: {
              product,
              planId,
              activatedAt: now,
              expiresAt: expiry,
            },
          },
        }
      );

    if (userUpdate.matchedCount === 0) {
      console.error(`User not found for email ${email} during premium activation`);
    }

    if (orderRecord) {
      await db
        .collection("orders")
        .updateOne(
          { orderId: razorpay_order_id },
          { $set: { status: "paid", paymentId: razorpay_payment_id, verifiedAt: now } }
        );
    }

    const invoiceResult = await sendInvoiceEmail({
      email,
      planLabel: planDuration.label,
      productLabel: PRODUCT_LABELS[product],
      baseAmount: baseAmount / 100,
      gstAmount: gstAmount / 100,
      amount: totalAmount / 100,
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      activatedAt: now,
      expiresAt: expiry,
    });

    return res.status(200).json({
      status: true,
      message: "Payment verified successfully. Premium activated.",
      subscription: {
        planId,
        product,
        productLabel: PRODUCT_LABELS[product],
        planLabel: planDuration.label,
        baseAmount: baseAmount / 100,
        gstAmount: gstAmount / 100,
        amount: totalAmount / 100,
        activatedAt: now.toISOString(),
        expiresAt: expiry ? expiry.toISOString() : null,
      },
      invoiceEmailSent: invoiceResult.sent,
    });
  } catch (error) {
    console.error("verifyPayment error:", error?.message || error);
    return res.status(500).json({ status: false, message: "Payment verification failed" });
  }
};

export const checkPremium = async (req, res) => {
  try {
    const db = mongoose.connection.db;
    const email = req.authUser?.email || "";

    if (!email) {
      return res.status(401).json({ status: false, message: "Authentication required" });
    }

    const user = await db.collection("users").findOne({ email });

    if (!user) {
      return res.status(200).json({ status: true, premium: false, premiumProducts: [] });
    }

    const activeProducts = getActiveProducts(user);

    if (activeProducts.length === 0 && !isPremiumActive(user)) {
      return res.status(200).json({ status: true, premium: false, premiumProducts: [] });
    }

    return res.status(200).json({
      status: true,
      premium: true,
      premiumProducts: activeProducts,
    });
  } catch (error) {
    console.error("checkPremium error:", error?.message || error);
    return res.status(500).json({ status: false, message: "Failed to check premium status" });
  }
};
