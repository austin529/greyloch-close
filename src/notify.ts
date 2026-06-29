import type { Env } from "./types";

// Notification dispatch. Currently posts Adaptive Cards to a Microsoft Teams
// incoming webhook (Power Automate "Workflows" URL). The channel is abstracted
// so email (or other) can be added later without touching call sites.
//
// All sends are best-effort and must be wrapped in ctx.waitUntil() by callers
// so a slow/failed webhook never blocks or fails the API response.

export interface Notification {
  title: string;
  /** Short summary line. */
  text: string;
  /** Optional key/value facts rendered as a FactSet. */
  facts?: { title: string; value: string }[];
  /** Optional "who this is for" line, e.g. a reviewer's name. */
  forWhom?: string | null;
  /** Accent: drives the card's emphasis. */
  level?: "default" | "good" | "warning" | "attention";
}

export async function notify(env: Env, n: Notification): Promise<void> {
  await sendTeams(env, n);
  // Future: if (env.RESEND_API_KEY) await sendEmail(env, n);
}

async function sendTeams(env: Env, n: Notification): Promise<void> {
  const webhook = env.TEAMS_WEBHOOK_URL;
  if (!webhook) return; // not configured (e.g. local dev) -> no-op
  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildCard(env, n)),
    });
    if (!res.ok) {
      console.error(`Teams notify failed: ${res.status} ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error("Teams notify error:", err);
  }
}

const COLORS = {
  default: "default",
  good: "good",
  warning: "warning",
  attention: "attention",
} as const;

// Payload shape accepted by the Power Automate "post an Adaptive Card to a
// channel" Workflow trigger.
function buildCard(env: Env, n: Notification) {
  const body: unknown[] = [
    {
      type: "TextBlock",
      text: n.title,
      weight: "Bolder",
      size: "Medium",
      color: COLORS[n.level ?? "default"],
      wrap: true,
    },
    { type: "TextBlock", text: n.text, wrap: true, spacing: "Small" },
  ];
  if (n.forWhom) {
    body.push({ type: "TextBlock", text: `For: ${n.forWhom}`, isSubtle: true, wrap: true, spacing: "None" });
  }
  if (n.facts?.length) {
    body.push({ type: "FactSet", facts: n.facts, spacing: "Small" });
  }

  const card: Record<string, unknown> = {
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    type: "AdaptiveCard",
    version: "1.5",
    body,
  };
  if (env.APP_URL) {
    card.actions = [{ type: "Action.OpenUrl", title: "Open the close app", url: env.APP_URL }];
  }

  return {
    type: "message",
    attachments: [
      { contentType: "application/vnd.microsoft.card.adaptive", content: card },
    ],
  };
}
