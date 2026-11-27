// Measures how many bytes this page actually pulled over the network,
// using the browser's Performance API. Powers the data-cost receipt.

/**
 * Price used by the receipt: GH₵0.1145 per MB (about GH₵117 per GB).
 * Why this rate: it is MTN Ghana's official pay-as-you-go (out-of-bundle) data
 * price, what a prepaid user pays when they have no bundle. That's the honest
 * worst case the lite page is meant to protect people from. Bundles are cheaper.
 * Source: MTN Ghana "Tariff review: VAT January 2026" FAQ,
 * https://mtn4186.zendesk.com/hc/en-us/articles/32234628177298-TARIFF-REVIEW-VAT-JANUARY-2026
 * Change this one number to match another operator or country.
 */
export const CEDIS_PER_MB = 0.1145;

/**
 * Bytes this page has pulled over the network so far:
 * 1. transferSize of the page and every finished download (Performance API).
 *    Cache hits report 0, which is correct: cached bytes cost the visitor nothing.
 * 2. Videos: browsers stream them in pieces and don't report those pieces, so
 *    for every <video data-bytes="..."> we estimate:
 *      file size x (seconds buffered / total seconds).
 *    data-bytes is the real file size, written into the page by the app.
 */
export function bytesTransferred(): number {
  const entries = [
    ...performance.getEntriesByType("navigation"),
    ...performance.getEntriesByType("resource"),
  ] as PerformanceResourceTiming[];

  const videos = Array.from(document.querySelectorAll<HTMLVideoElement>("video[data-bytes]"));
  const videoUrls = new Set(videos.map((v) => v.currentSrc));

  // Finished downloads, skipping videos (counted below, so never twice).
  let total = entries
    .filter((entry) => !videoUrls.has(entry.name))
    .reduce((sum, entry) => sum + (entry.transferSize || 0), 0);

  for (const video of videos) {
    if (!video.duration || !Number.isFinite(video.duration)) continue;
    let bufferedSeconds = 0;
    for (let i = 0; i < video.buffered.length; i++) {
      bufferedSeconds += video.buffered.end(i) - video.buffered.start(i);
    }
    total += Number(video.dataset.bytes) * Math.min(1, bufferedSeconds / video.duration);
  }
  return Math.round(total);
}

/**
 * Cost in Ghana cedis. Uses the same MB the footer shows (1 MB = 1,000,000 bytes)
 * so the two numbers on screen agree. If MTN bills 1 MB as 1,048,576 bytes, the
 * real charge is about 5% lower than shown.
 */
export function bytesToCedis(bytes: number): number {
  return (bytes / 1_000_000) * CEDIS_PER_MB;
}
