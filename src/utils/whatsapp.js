import axios from "axios";

export const normalizeReceiverNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";

  if (digits.length === 10) {
    return `91${digits}`;
  }

  if (digits.length === 12 && digits.startsWith("91")) {
    return digits;
  }

  return "";
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export const sendWhatsappMessage = async ({ number, message }) => {
  const username = (process.env.WHATSAPPER_USERNAME || "FinvestApp").trim();
  const token = process.env.WHATSAPPER_TOKEN || "";
  const baseUrl = process.env.WHATSAPPER_BASE_URL || "";
  const endpointPath = "/api/public/send-msg";

  if (!baseUrl) {
    throw new Error("WHATSAPPER_BASE_URL is missing in environment variables");
  }

  if (!token) {
    throw new Error("WHATSAPPER_TOKEN is missing in environment variables");
  }

  if (!number) {
    throw new Error("WhatsApp receiver number is missing or invalid");
  }

  if (!message) {
    throw new Error("WhatsApp message is empty");
  }

  const normalizedBaseUrl = baseUrl.replace(/\/+$/, "");
  const requestUrl = normalizedBaseUrl.endsWith(endpointPath)
    ? normalizedBaseUrl
    : `${normalizedBaseUrl}${endpointPath}`;

  const response = await axios.get(requestUrl, {
    params: {
      username,
      number,
      message,
      token,
    },
    responseType: "text",
    headers: {
      "cache-control": "no-store",
    },
  });

  let parsed = response.data;
  if (typeof parsed === "string") {
    if (parsed.trim().toLowerCase().startsWith("<!doctype html")) {
      throw new Error(
        "WhatsApp API returned HTML page. Check WHATSAPPER_BASE_URL and ensure it points to the send endpoint."
      );
    }

    try {
      parsed = JSON.parse(parsed);
    } catch (err) {
      // If API returns non-JSON text, keep it as-is for debugging
      parsed = { success: false, status: "error", message: response.data };
    }
  }

  const payload = Array.isArray(parsed) ? parsed[0] : parsed;
  const ok = payload?.status === "success" || payload?.success === true;

  if (!ok) {
    const reason =
      payload?.message || payload?.error || payload?.msg || "Whatsapper API failed";
    throw new Error(String(reason));
  }

  return payload;
};
