import axios from "axios";

export const normalizeReceiverNumber = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  if (!digits) return "";

  let normalized = digits;

  if (normalized.startsWith("00")) {
    normalized = normalized.slice(2);
  }

  if (normalized.length === 11 && normalized.startsWith("0")) {
    normalized = normalized.slice(1);
  }

  if (normalized.length === 10) {
    return `91${normalized}`;
  }

  if (normalized.length === 12 && normalized.startsWith("91")) {
    return normalized;
  }

  return "";
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const parseWhatsapperPayload = (rawData) => {
  if (typeof rawData === "string") {
    const trimmed = rawData.trim();

    if (trimmed.toLowerCase().startsWith("<!doctype html")) {
      throw new Error(
        "WhatsApp API returned HTML page. Check WHATSAPPER_BASE_URL and ensure it points to the send endpoint."
      );
    }

    try {
      return JSON.parse(trimmed);
    } catch (err) {
      return {
        success: false,
        status: "error",
        message: trimmed,
      };
    }
  }

  return rawData;
};

const isWhatsapperSuccess = (payload) => {
  if (!payload || typeof payload !== "object") return false;

  const statusText = String(payload.status || payload.Status || "")
    .trim()
    .toLowerCase();
  const messageText = String(payload.message || payload.msg || "")
    .trim()
    .toLowerCase();

  if (payload.success === true) return true;
  if (["success", "ok", "sent", "queued"].includes(statusText)) return true;
  if (messageText.includes("campaign started")) return true;

  return false;
};

export const sendWhatsappMessage = async ({ number, message }) => {
  const username = (process.env.WHATSAPPER_USERNAME || "FinvestApp").trim();
  const primaryToken = process.env.WHATSAPPER_TOKEN || "";
  const fallbackToken = process.env.WHATSAPPER_TOKEN_FALLBACK || "";
  const baseUrl = process.env.WHATSAPPER_BASE_URL || "";
  const timeoutMs = Number(process.env.WHATSAPPER_TIMEOUT_MS || 10000);
  const maxAttempts = Math.max(1, Number(process.env.WHATSAPPER_RETRIES || 2));
  const endpointPath = "/api/public/send-msg";

  const tokenPool = [
    ...String(primaryToken)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
    ...String(fallbackToken)
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  ];

  const uniqueTokens = Array.from(new Set(tokenPool));

  if (!baseUrl) {
    throw new Error("WHATSAPPER_BASE_URL is missing in environment variables");
  }

  if (!uniqueTokens.length) {
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

  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    for (const token of uniqueTokens) {
      try {
        const response = await axios.get(requestUrl, {
          timeout: timeoutMs,
          responseType: "text",
          params: {
            username,
            number,
            message,
            token,
          },
          headers: {
            "cache-control": "no-store",
            Accept: "application/json, text/plain, */*",
          },
        });

        const parsed = parseWhatsapperPayload(response.data);

        const payload = Array.isArray(parsed) ? parsed[0] : parsed;
        const ok = isWhatsapperSuccess(payload);

        if (!ok) {
          const reason =
            payload?.message || payload?.error || payload?.msg || "Whatsapper API failed";
          throw new Error(String(reason));
        }

        return payload;
      } catch (error) {
        const responseBody = error?.response?.data;
        const detail =
          typeof responseBody === "string"
            ? responseBody
            : JSON.stringify(responseBody || {});
        const baseMessage = error?.message || "whatsapper_request_failed";
        lastError = new Error(
          `${baseMessage}${detail && detail !== "{}" ? ` | response: ${detail}` : ""}`
        );
      }
    }

    if (attempt < maxAttempts) {
      await sleep(250 * attempt);
    }
  }

  throw lastError;
};
