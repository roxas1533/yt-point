import { Innertube, YTNodes } from "youtubei.js";
import type { LiveChat } from "youtubei.js/dist/src/parser/youtube";

interface RpcRequest {
  id: number;
  method: string;
  params?: Record<string, unknown>;
}

interface RpcResponse {
  id: number;
  result?: unknown;
  error?: string;
}

interface LiveInfo {
  videoId: string;
  title: string;
  channelId: string;
  channelName: string;
  concurrentViewers: number;
  likeCount: number;
  isLive: boolean;
}

interface SuperChatEvent {
  id: string;
  author: string;
  amount: number;
  currency: string;
  message: string;
  timestamp: number;
}

interface PushEvent {
  event: {
    type: "superchat";
    data: SuperChatEvent;
  };
}

let youtube: Innertube | null = null;
let liveChatInstance: LiveChat | null = null;
let storedCookies: string | null = null;
const encoder = new TextEncoder();

async function initYoutube(): Promise<void> {
  if (storedCookies) {
    // Create authenticated session with cookies
    youtube = await Innertube.create({
      cookie: storedCookies,
    });
    console.error("YouTube client initialized with authentication");
  } else {
    youtube = await Innertube.create();
    console.error("YouTube client initialized without authentication");
  }
}

function setCookies(cookies: string): void {
  storedCookies = cookies;
  console.error("Cookies stored for authentication");
}

async function getLiveInfo(videoId: string): Promise<LiveInfo> {
  if (!youtube) {
    throw new Error("YouTube client not initialized");
  }

  const info = await youtube.getInfo(videoId);
  const basicInfo = info.basic_info;

  // Get concurrent viewers from view_count
  let concurrentViewers = 0;
  const viewCountData = info.primary_info?.view_count as unknown as {
    original_view_count?: { text?: string } | string;
    view_count?: { text?: string } | string;
    short_view_count?: { text?: string } | string;
    toString(): string;
  };
  if (viewCountData) {
    // Try to extract view count from various properties
    const getText = (val: { text?: string } | string | undefined): string | undefined => {
      if (!val) return undefined;
      if (typeof val === "string") return val;
      return val.text;
    };
    const originalText =
      getText(viewCountData.original_view_count) ||
      getText(viewCountData.view_count) ||
      viewCountData.toString();
    if (originalText) {
      const match = originalText.match(/[\d,]+/);
      if (match) {
        concurrentViewers = Number.parseInt(match[0].replace(/,/g, ""), 10);
      }
    }
  }

  // Get like count from basic_info (most reliable)
  const likeCount = basicInfo.like_count ?? 0;

  return {
    videoId,
    title: basicInfo.title || "",
    channelId: basicInfo.channel_id || "",
    channelName: basicInfo.author || "",
    concurrentViewers,
    likeCount,
    isLive: basicInfo.is_live || false,
  };
}

function parseCount(str: string): number {
  const cleaned = str.replace(/,/g, "");
  const match = cleaned.match(/([\d.]+)([KMB万億])?/i);
  if (!match) return 0;

  let num = Number.parseFloat(match[1]);
  const suffix = match[2];

  if (suffix === "K" || suffix === "k") num *= 1000;
  else if (suffix === "M" || suffix === "m") num *= 1000000;
  else if (suffix === "B" || suffix === "b") num *= 1000000000;
  else if (suffix === "万") num *= 10000;
  else if (suffix === "億") num *= 100000000;

  return Math.floor(num);
}

function parseSuperchatAmount(purchaseAmount: string): {
  amount: number;
  currency: string;
} {
  // "¥1,000", "$5.00", "€10,00", "£10.00" etc.
  const match = purchaseAmount.match(/([^\d\s]+)\s*([\d,.]+)/);
  if (!match) return { amount: 0, currency: "JPY" };

  const currencySymbol = match[1].trim();
  const amountStr = match[2].replace(/,/g, "").replace(/\.(?=\d{3})/g, "");
  const amount = Math.floor(parseFloat(amountStr));

  const currencyMap: Record<string, string> = {
    "¥": "JPY",
    $: "USD",
    "€": "EUR",
    "£": "GBP",
    "₩": "KRW",
    "₹": "INR",
    CA$: "CAD",
    A$: "AUD",
    HK$: "HKD",
    NT$: "TWD",
  };

  return {
    amount,
    currency: currencyMap[currencySymbol] || "JPY",
  };
}

async function emitPushEvent(event: PushEvent): Promise<void> {
  const output = `${JSON.stringify(event)}\n`;
  await Bun.write(Bun.stdout, encoder.encode(output));
}

async function startLiveChat(videoId: string): Promise<void> {
  if (!youtube) {
    throw new Error("YouTube client not initialized");
  }

  if (liveChatInstance) {
    liveChatInstance.stop();
    liveChatInstance = null;
  }

  const info = await youtube.getInfo(videoId);
  const liveChat = info.getLiveChat();

  liveChat.on("chat-update", (action) => {
    if (action.is(YTNodes.AddChatItemAction)) {
      const item = action.item;
      if (item?.is(YTNodes.LiveChatPaidMessage)) {
        const { amount, currency } = parseSuperchatAmount(item.purchase_amount || "");

        const authorName = item.author?.name;
        const messageText = item.message;
        const superchatEvent: SuperChatEvent = {
          id: item.id || `sc-${Date.now()}`,
          author:
            typeof authorName === "string"
              ? authorName
              : (authorName as { text?: string })?.text || "Unknown",
          amount,
          currency,
          message:
            typeof messageText === "string"
              ? messageText
              : (messageText as { text?: string })?.text || "",
          timestamp: Date.now(),
        };

        emitPushEvent({
          event: {
            type: "superchat",
            data: superchatEvent,
          },
        }).catch((e) => console.error("Failed to emit superchat event:", e));
      }
    }
  });

  liveChat.on("error", (error) => {
    console.error("LiveChat error:", error);
  });

  liveChat.start();
  liveChatInstance = liveChat;
}

function stopLiveChat(): void {
  if (liveChatInstance) {
    liveChatInstance.stop();
    liveChatInstance = null;
  }
}

async function getChannelSubscriberCount(channelId: string): Promise<number> {
  if (!youtube) {
    throw new Error("YouTube client not initialized");
  }

  try {
    const channel = await youtube.getChannel(channelId);

    // Try to get subscriber count from header.content.metadata
    const header = channel.header as unknown as {
      content?: {
        metadata?: {
          metadata_rows?: Array<{
            metadata_parts?: Array<{
              text?: { text?: string };
            }>;
          }>;
        };
      };
    };

    const metadataRows = header?.content?.metadata?.metadata_rows;
    if (metadataRows) {
      for (const row of metadataRows) {
        for (const part of row.metadata_parts || []) {
          const text = part.text?.text || "";
          if (text.includes("subscriber")) {
            return parseCount(text);
          }
        }
      }
    }

    // Fallback: try old metadata location
    const oldMetadata = channel.metadata as unknown as {
      subscriber_count?: string;
    };
    if (oldMetadata?.subscriber_count) {
      return parseCount(oldMetadata.subscriber_count);
    }
  } catch (e) {
    console.error("Failed to get channel info:", e);
  }

  return 0;
}

async function getExactSubscriberCount(): Promise<number> {
  if (!youtube) {
    throw new Error("YouTube client not initialized");
  }

  if (!storedCookies) {
    throw new Error("Authentication required for exact subscriber count");
  }

  try {
    // Use YouTube Studio Analytics API via youtubei.js
    // The authenticated session allows access to creator-only endpoints
    const analyticsData = await youtube.actions.execute(
      "/youtubei/v1/creator/get_channel_dashboard",
      { parse: true },
    );

    // Parse the analytics response to get exact subscriber count
    const data = analyticsData as unknown as {
      cards?: Array<{
        channelAnalyticsCard?: {
          subscriberCount?: {
            subscriberCount?: string;
            subscriberCountLabel?: { runs?: Array<{ text?: string }> };
          };
          metrics?: Array<{
            subtitle?: { runs?: Array<{ text?: string }> };
            metric?: { runs?: Array<{ text?: string }> };
          }>;
        };
      }>;
    };

    // Try to find subscriber count in the dashboard response
    if (data.cards) {
      for (const card of data.cards) {
        if (card.channelAnalyticsCard) {
          // Check direct subscriberCount field
          const subCount = card.channelAnalyticsCard.subscriberCount;
          if (subCount?.subscriberCount) {
            return Number.parseInt(subCount.subscriberCount, 10);
          }

          // Check metrics array
          const metrics = card.channelAnalyticsCard.metrics;
          if (metrics) {
            for (const metric of metrics) {
              const subtitleText = metric.subtitle?.runs?.map((r) => r.text).join("") || "";
              if (subtitleText.toLowerCase().includes("subscriber")) {
                const countText = metric.metric?.runs?.map((r) => r.text).join("") || "";
                const count = Number.parseInt(countText.replace(/,/g, ""), 10);
                if (!Number.isNaN(count)) {
                  return count;
                }
              }
            }
          }
        }
      }
    }

    throw new Error("Could not find subscriber count in analytics data");
  } catch (e) {
    console.error("Failed to get exact subscriber count:", e);
    throw e;
  }
}

async function handleRequest(request: RpcRequest): Promise<RpcResponse> {
  try {
    let result: unknown;

    switch (request.method) {
      case "init":
        await initYoutube();
        result = { success: true, authenticated: !!storedCookies };
        break;

      case "setCookies": {
        const cookies = request.params?.cookies as string;
        if (!cookies) {
          throw new Error("cookies is required");
        }
        setCookies(cookies);
        result = { success: true };
        break;
      }

      case "getLiveInfo": {
        const videoId = request.params?.videoId as string;
        if (!videoId) {
          throw new Error("videoId is required");
        }
        result = await getLiveInfo(videoId);
        break;
      }

      case "getSubscriberCount": {
        const channelId = request.params?.channelId as string;
        if (!channelId) {
          throw new Error("channelId is required");
        }
        result = { count: await getChannelSubscriberCount(channelId) };
        break;
      }

      case "getExactSubscriberCount":
        result = { count: await getExactSubscriberCount() };
        break;

      case "startLiveChat": {
        const videoId = request.params?.videoId as string;
        if (!videoId) {
          throw new Error("videoId is required");
        }
        await startLiveChat(videoId);
        result = { success: true };
        break;
      }

      case "stopLiveChat":
        stopLiveChat();
        result = { success: true };
        break;

      case "ping":
        result = { pong: true, timestamp: Date.now() };
        break;

      default:
        throw new Error(`Unknown method: ${request.method}`);
    }

    return { id: request.id, result };
  } catch (error) {
    return {
      id: request.id,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const decoder = new TextDecoder();

  console.error("YouTube sidecar started");

  for await (const chunk of Bun.stdin.stream()) {
    const lines = decoder.decode(chunk).trim().split("\n");

    for (const line of lines) {
      if (!line) continue;

      try {
        const request: RpcRequest = JSON.parse(line);
        const response = await handleRequest(request);
        const output = `${JSON.stringify(response)}\n`;
        await Bun.write(Bun.stdout, encoder.encode(output));
      } catch (e) {
        console.error("Failed to parse request:", e);
      }
    }
  }
}

main().catch(console.error);
