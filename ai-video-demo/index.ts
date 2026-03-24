import { experimental_generateVideo as generateVideo } from 'ai';
import fs from 'node:fs';
import 'dotenv/config';

async function main() {
  const result = await generateVideo({
    model: 'google/veo-3-generate',
    prompt: 'A serene mountain landscape at sunset with clouds drifting by',
    aspectRatio: '16:9',
    duration: 8,
  });

  const v = result.videos[0];
  if (v) {
    fs.writeFileSync('output.mp4', v.uint8Array);
    console.log('Video saved to output.mp4');
  }
}

main().catch(console.error);
