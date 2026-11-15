// The one state store: round, economy, match and spike. Entity modules own their
// own bodies (player, bots, weapons) but every rule that decides a round reads
// and writes here, so the round logic has a single source of truth.
export const FIRST_TO = 5;
export const ROUND_SECONDS = 100;
export const BUY_SECONDS = 6;
export const FUSE_SECONDS = 35;
export const PLANT_SECONDS = 3;
export const DEFUSE_SECONDS = 4;

export function createState() {
  return {
    phase: 'menu', // menu | buy | live | roundEnd | matchEnd
    round: 1,
    wins: { us: 0, them: 0 },
    timer: ROUND_SECONDS,
    buyTimer: BUY_SECONDS,
    money: 800,
    kills: 0,
    deaths: 0,
    // spike: carried | dropped | planted | detonated | defused | gone
    spike: { state: 'carried', site: null, x: 0, z: 0, plant: 0, fuse: 0, defuse: 0, defuser: null },
    banner: null, // { title, sub, tone } shown by the HUD until bannerLeft runs out
    bannerLeft: 0,
    time: 0,
    spectate: false, // player dead but the planted spike still ticks
  };
}
