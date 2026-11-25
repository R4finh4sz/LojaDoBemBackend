import { resendConfig } from "@/config/env";
import { EmailConfigurationError } from "./EmailConfigurationError";
import { EmailDeliveryError } from "./EmailDeliveryError";

export { EmailConfigurationError } from "./EmailConfigurationError";
export { EmailDeliveryError } from "./EmailDeliveryError";

function getEmailErrorMessage(err: unknown) {
  if (err instanceof Error) {
    return err.message;
  }

  return "Erro desconhecido";
}

interface SendEmailParams {
  to: string;
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
}

export async function sendEmail({ to, subject, htmlContent, textContent }: SendEmailParams) {
  const { apiKey, senderEmail, senderName } = resendConfig;
  if (!apiKey || !senderEmail) {
    throw new EmailConfigurationError("Configuração do Resend não encontrada");
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: `${senderName} <${senderEmail}>`,
        to: [to],
        subject,
        text: textContent,
        html: htmlContent,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      await response.body?.cancel();
      throw new Error(`HTTP ${response.status}`);
    }

    const { id } = await response.json() as { id: string };
    console.log("E-mail aceito pelo Resend:", id);
  } catch (err) {
    const message = getEmailErrorMessage(err);

    console.error("Falha ao enviar e-mail pelo Resend:", message);
    throw new EmailDeliveryError(`Falha ao enviar e-mail pelo Resend: ${message}`);
  }
}
