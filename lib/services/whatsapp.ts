import type { Json } from "@/types/database.types";

const GRAPH_VERSION = "v21.0";

export type WhatsAppTemplateName = string;

export type WhatsAppTemplateComponent = {
  type: "header" | "body" | "button";
  sub_type?: string;
  index?: string;
  parameters: Array<
    | { type: "text"; text: string }
    | { type: "currency"; currency: { fallback_value: string; code: string; amount_1000: number } }
    | { type: "date_time"; date_time: { fallback_value: string } }
    | { type: "payload"; payload: string }
  >;
};

export type WhatsAppSendResult = {
  ok: boolean;
  messageId?: string;
  error?: unknown;
};

type GraphSuccess = {
  messages?: Array<{ id?: string }>;
};

type GraphFailure = {
  error?: {
    message?: string;
    type?: string;
    code?: number;
    error_subcode?: number;
    fbtrace_id?: string;
  };
};

function getWhatsAppConfig() {
  const token = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;

  if (!token || !phoneNumberId) {
    throw new Error("Missing WHATSAPP_API_TOKEN or WHATSAPP_PHONE_NUMBER_ID");
  }

  return { token, phoneNumberId };
}

function normalizeMsisdn(to: string): string {
  return to.replace(/[^\d]/g, "");
}

function graphUrl(phoneNumberId: string): string {
  return `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;
}

async function postGraph(
  payload: Record<string, unknown>,
): Promise<WhatsAppSendResult> {
  const { token, phoneNumberId } = getWhatsAppConfig();

  try {
    const response = await fetch(graphUrl(phoneNumberId), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const body = (await response.json()) as GraphSuccess & GraphFailure;

    if (!response.ok || body.error) {
      return {
        ok: false,
        error: (body.error ?? body) as Json,
      };
    }

    const messageId = body.messages?.[0]?.id;
    return { ok: true, messageId };
  } catch (error) {
    return { ok: false, error };
  }
}

export async function sendWhatsAppTemplate(
  to: string,
  templateName: WhatsAppTemplateName,
  components: WhatsAppTemplateComponent[] = [],
): Promise<WhatsAppSendResult> {
  return postGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeMsisdn(to),
    type: "template",
    template: {
      name: templateName,
      language: { code: process.env.WHATSAPP_TEMPLATE_LANGUAGE ?? "en_US" },
      ...(components.length > 0 ? { components } : {}),
    },
  });
}

export async function sendWhatsAppText(
  to: string,
  text: string,
): Promise<WhatsAppSendResult> {
  return postGraph({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: normalizeMsisdn(to),
    type: "text",
    text: {
      preview_url: false,
      body: text,
    },
  });
}

export const NOTIFICATION_TEMPLATE_MAP = {
  confirmation: process.env.WHATSAPP_CONFIRMATION_TEMPLATE ?? "salon_booking_confirm",
  reminder_24h: "salon_reminder_24h",
  reminder_2h: "salon_reminder_2h",
  cancellation: process.env.WHATSAPP_CANCELLATION_TEMPLATE ?? "salon_booking_cancel",
} as const satisfies Record<string, WhatsAppTemplateName>;

export function confirmationTemplateUsesButtons(): boolean {
  return process.env.WHATSAPP_CONFIRMATION_HAS_ACTION_BUTTONS === "true";
}

export function formatCancellationMessage(input: {
  customerName: string;
  salonName: string;
  serviceName?: string;
  startTime: string;
  reason?: string | null;
  refundStatus?: "not_required" | "pending" | "refunded" | "not_possible";
  refundReference?: string | null;
  depositAmount?: number;
  customerPhone?: string;
  salonSlug?: string;
}): string {
  const timeFormatted = new Intl.DateTimeFormat("en-MU", {
    timeZone: "Indian/Mauritius",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(input.startTime));

  let refundNote = "";
  if (input.depositAmount && input.depositAmount > 0) {
    if (input.refundStatus === "refunded") {
      refundNote = `\n\n💳 *Remboursement Acompte:* Votre acompte de Rs ${input.depositAmount} a été remboursé par MCB Juice${input.refundReference ? ` (Réf: ${input.refundReference})` : ""}.`;
    } else if (input.refundStatus === "pending") {
      refundNote = `\n\n💳 *Remboursement Acompte:* Votre acompte de Rs ${input.depositAmount} vous sera remboursé par MCB Juice sur votre numéro (${input.customerPhone ?? ""}) dans les plus brefs délais.`;
    }
  }

  const reasonText = input.reason ? `\n\n*Motif:* ${input.reason}` : "";
  const rebookLink = input.salonSlug ? `\n\nPour replanifier votre rendez-vous: https://freshcuts.mu/${input.salonSlug}` : "";

  return `Bonjour ${input.customerName},

Nous regrettons de vous informer que votre rendez-vous chez *${input.salonName}* prévu le *${timeFormatted}*${input.serviceName ? ` (${input.serviceName})` : ""} a dû être annulé.${reasonText}${refundNote}

Nous vous prions d'accepter nos sincères excuses pour ce contretemps.${rebookLink}

L'équipe ${input.salonName}`;
}

