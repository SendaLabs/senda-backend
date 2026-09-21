require("dotenv").config();
const axios = require("axios");

// Reemplazá este placeholder por tu número con código de país, sin + ni espacios.
// Ejemplo Argentina: 5491112345678
const TO = "50664549767";

const VIDEO_URL =
  "https://github.com/SendaLabs/senda-backend/raw/refs/heads/main/src/public/0920.mp4";

const CAPTION =
  "¡Hola! 👋 Bienvenido a Senda. Senda puede ayudarte a enviar, recibir y gestionar fácilmente.";

async function main() {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token) {
    console.error("Falta WHATSAPP_TOKEN en el archivo .env");
    process.exit(1);
  }

  if (!phoneNumberId) {
    console.error("Falta WHATSAPP_PHONE_NUMBER_ID en el archivo .env");
    process.exit(1);
  }

  if (!TO || TO === "TU_NUMERO_DE_TELEFONO") {
    console.error(
      "Reemplazá la constante TO en test-video.js por tu número internacional (sin +)."
    );
    process.exit(1);
  }

  const url = `https://graph.facebook.com/v17.0/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: TO,
    type: "video",
    video: {
      link: VIDEO_URL,
      caption: CAPTION,
    },
  };

  console.log("POST", url);
  console.log("Payload:", JSON.stringify(payload, null, 2));

  try {
    const { status, data } = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    console.log("Meta aceptó el envío. Status:", status);
    console.log(JSON.stringify(data, null, 2));
  } catch (error) {
    if (error.response) {
      console.error("Meta rechazó el envío. Status:", error.response.status);
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error("Error de red o de script:", error.message);
    }

    process.exit(1);
  }
}

main();
