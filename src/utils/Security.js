import CryptoJS from "crypto-js";

export const encryptData = (data, secretKey) => {
  if (typeof data === "string" || typeof data === "object") {
    return CryptoJS.AES.encrypt(JSON.stringify(data), secretKey).toString();
  } else if (data instanceof File) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const arrayBuffer = reader.result;
        const encryptedFile = CryptoJS.AES.encrypt(
          arrayBuffer,
          secretKey
        ).toString();
        resolve(encryptedFile);
      };
      reader.onerror = (error) => {
        reject(error);
      };
      reader.readAsArrayBuffer(data);
    });
  } else {
    throw new Error("Unsupported data type");
  }
};

export const decryptData = (ciphertext, secretKey, isFile = false) => {
    if (typeof ciphertext === "object") {
      return ciphertext;
    }
  
    if (typeof ciphertext === "string" && typeof secretKey === "string") {
      const decrypted = CryptoJS.AES.decrypt(ciphertext, secretKey);
  
      if (isFile) {
        const arrayBuffer = decrypted.toString(CryptoJS.enc.Latin1);
        return new Blob([arrayBuffer], { type: "application/octet-stream" });
      } else {
        return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
      }
    }
  
    throw new Error("Unsupported data type");
  };
  