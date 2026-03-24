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
    fs.writeFileSync('output.png', Buffer.from(imageData.base64, 'base64'));
    console.log('Image saved to output.png');
  }
}

main().catch(console.error);
