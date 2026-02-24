export const deliverWebhook = async (
  url: string,
  payload: Record<string, unknown>
) => {
  return {
    url,
    payload,
    status: "queued",
    message: "TODO: send webhook via HTTP client",
  };
};
