import fs from "node:fs/promises";

const ZERO_X_ZERO_URL = "https://0x0.st/";
const ZERO_X_ZERO_USER_AGENT = "osrs-coordinate-preview/0.1.0 (+https://github.com/mpickering/osrs-coordinate-preview)";

export async function uploadImageTo0x0(imagePath: string, imageName: string): Promise<string> {
  const file = await fs.readFile(imagePath);
  const form = new FormData();
  form.set("file", new Blob([file], { type: "image/png" }), imageName);

  const response = await fetch(ZERO_X_ZERO_URL, {
    method: "POST",
    headers: {
      "user-agent": ZERO_X_ZERO_USER_AGENT
    },
    body: form
  });

  if (!response.ok) {
    throw new Error(`Failed to upload ${imageName} to 0x0: ${response.status} ${response.statusText}`);
  }

  return (await response.text()).trim();
}
