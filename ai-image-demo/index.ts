import { generateImage } from 'ai';
import fs from 'node:fs';
import 'dotenv/config';

async function main() {
  const result = await generateImage({
    model: 'black-forest-labs/flux-1.1-pro',
    prompt: 'A serene mountain landscape at sunset with a calm lake reflection',
  });

  const imageData = result.images[0];
  if (imageData) {
    const buf = imageData.base64
      ? Buffer.from(imageData.base64, 'base64')
      : imageData.uint8Array
        ? Buffer.from(imageData.uint8Array)
        : null;
    if (buf) {
      fs.writeFileSync('output.png', buf);
      console.log('Image saved to output.png');
    } else {
      console.error('No image bytes in response (expected base64 or uint8Array).');
    }
  }
}

main().catch(console.error);
