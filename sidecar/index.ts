import { Innertube, YTNodes } from "youtubei.js";

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

let youtube: Innertube | null = null;

async function initYoutube(): Promise<void> {
  youtube = await Innertube.create();
}

async function getLiveInfo(videoId: string): Promise<LiveInfo> {
  if (!youtube) {
    throw new Error("YouTube client not initialized");
  }

  const info = await youtube.getInfo(videoId);
  const basicInfo = info.basic_info;
  const viewCount = info.primary_info?.view_count;

  let concurrentViewers = 0;
  if (viewCount?.view_count) {
    const match = viewCount.view_count.text?.match(/[\d,]+/);
    if (match) {
      concurrentViewers = parseInt(match[0].replace(/,/g, ""), 10);
    }
  }

  const likeButton = info.primary_info?.menu?.top_level_buttons?.find(
    (btn): btn is YTNodes.SegmentedLikeDislikeButton => btn.is(YTNodes.SegmentedLikeDislikeButton),
  );

  let likeCount = 0;
  if (likeButton?.like_button?.is(YTNodes.ToggleButton)) {
    const likeText = likeButton.like_button.default_text?.text;
    if (likeText) {
      const match = likeText.match(/[\d,.KMB]+/i);
      if (match) {
        likeCount = parseCount(match[0]);
      }
    }
  }

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
  const match = cleaned.match(/([\d.]+)([KMB])?/i);
  if (!match) return 0;

  let num = parseFloat(match[1]);
  const suffix = match[2]?.toUpperCase();

  if (suffix === "K") num *= 1000;
  else if (suffix === "M") num *= 1000000;
  else if (suffix === "B") num *= 1000000000;

  return Math.floor(num);
}

async function getChannelSubscriberCount(channelId: string): Promise<number> {
  if (!youtube) {
    throw new Error("YouTube client not initialized");
  }

  try {
    const channel = await youtube.getChannel(channelId);
    const subText = channel.metadata?.subscriber_count;
    if (subText) {
      return parseCount(subText);
    }
  } catch (e) {
    console.error("Failed to get channel info:", e);
  }

  return 0;
}

async function handleRequest(request: RpcRequest): Promise<RpcResponse> {
  try {
    let result: unknown;

    switch (request.method) {
      case "init":
        await initYoutube();
        result = { success: true };
        break;

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
  const encoder = new TextEncoder();

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
