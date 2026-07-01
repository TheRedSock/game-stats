const IGDB_IMAGE_BASE = "https://images.igdb.com/igdb/image/upload";

export type IgdbImageSize = "cover_big" | "cover_small" | "screenshot_big" | "thumb";

export function igdbImageUrl(imageId: string | null | undefined, size: IgdbImageSize = "cover_big") {
  if (!imageId) return null;
  return `${IGDB_IMAGE_BASE}/t_${size}/${imageId}.jpg`;
}
