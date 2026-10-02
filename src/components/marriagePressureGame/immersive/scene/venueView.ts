import type { VenueId } from "../../activities";

export interface VenueView {
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  seated: boolean;
  partner: [number, number, number];
}

// The camera occupies the player's chair/standing position, never a spectator seat.
export function venueView(venue: VenueId): VenueView {
  if (["restaurant", "hotpot", "western", "cafe", "boardgame", "catcafe"].includes(venue)) {
    return { position: [0, 1.26, 0.85], target: [0, 1.12, -1.3], fov: 64, seated: true, partner: [0, 0.64, -1.25] };
  }
  if (venue === "cinema") return { position: [0, 1.22, 1.1], target: [0.45, 1.16, -1], fov: 66, seated: true, partner: [0.9, 0.67, -0.65] };
  return { position: [0, 1.62, 1.15], target: [0.35, 1.18, -1.25], fov: 64, seated: false, partner: [0.4, 1.05, -1.15] };
}
