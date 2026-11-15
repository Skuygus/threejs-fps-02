// The round machine: buy phase, live round, round end, match end. It owns the
// economy (money in, weapons out), the spike (plant / fuse / defuse) and the
// win conditions. It reads the player through the ctx main.js passes each tick
// and returns the events that tick so main.js can react (pointer lock, overlays).
import * as THREE from 'three';
import { FIRST_TO, ROUND_SECONDS, BUY_SECONDS, FUSE_SECONDS, PLANT_SECONDS, DEFUSE_SECONDS } from './state.js';
import { WEAPONS, GRENADE_PRICE, ARMOR_PRICE } from './weapons.js';

const KILL_REWARD = 300;
const WIN_REWARD = 325;
const LOSS_REWARD = 190;

export function createRounds(deps) {
  const { state, world, weapons, bots, hud, audio, fx } = deps;
  let roundEndLeft = 0;

  function banner(title, sub, tone) {
    state.banner = { title, sub, tone };
    state.bannerLeft = 4;
    hud.setBanner(title, sub, tone);
  }

  function startMatch() {
    state.round = 1;
    state.wins.us = 0;
    state.wins.them = 0;
    state.money = 800;
    state.kills = 0;
    state.deaths = 0;
    startRound();
  }

  function startRound() {
    state.phase = 'buy';
    state.buyTimer = BUY_SECONDS;
    state.timer = ROUND_SECONDS;
    state.spike = { state: 'carried', site: null, x: 0, z: 0, plant: 0, fuse: 0, defuse: 0, defuser: null };
    state.spectate = false;
    state.banner = null;
    bots.reset();
    weapons.refillReserves();
    hud.setMoney(state.money);
    hud.setScore(state.wins.us, state.wins.them, state.round);
    hud.setHealth(100, weapons.state.armor);
    hud.setBomb(null);
    hud.showBuy(buyItems());
  }

  function buyItems() {
    const items = Object.entries(WEAPONS).map(([id, def]) => ({
      id, name: def.name, price: def.price, owned: Boolean(weapons.owned[id]),
    }));
    items.push({ id: 'grenade', name: 'Frag Grenade', price: GRENADE_PRICE, owned: weapons.state.grenades >= 2 });
    items.push({ id: 'armor', name: 'Vest Armor', price: ARMOR_PRICE, owned: weapons.state.armor >= 50 });
    return items;
  }

  function buy(id) {
    if (state.phase !== 'buy') return false;
    if (id === 'grenade') {
      if (weapons.state.grenades >= 2 || state.money < GRENADE_PRICE) return false;
      state.money -= GRENADE_PRICE;
      weapons.state.grenades += 1;
    } else if (id === 'armor') {
      if (weapons.state.armor >= 50 || state.money < ARMOR_PRICE) return false;
      state.money -= ARMOR_PRICE;
      weapons.state.armor = 50;
    } else {
      const cost = weapons.buy(id, state.money);
      if (!cost) return false;
      state.money -= cost;
      weapons.equip(id);
    }
    audio.buy();
    hud.setMoney(state.money);
    hud.showBuy(buyItems());
    hud.setAmmo(weapons.ammo().mag, weapons.ammo().reserve);
    hud.setWeapon(weapons.def().name);
    hud.setHealth(100, weapons.state.armor);
    return true;
  }

  function endRound(won, reason) {
    state.phase = 'roundEnd';
    roundEndLeft = 4;
    if (won) {
      state.wins.us += 1;
      state.money += WIN_REWARD;
      audio.roundWin();
      banner('ROUND WON', reason, 'win');
    } else {
      state.wins.them += 1;
      state.money += LOSS_REWARD;
      audio.roundLose();
      banner('ROUND LOST', reason, 'lose');
    }
    hud.setMoney(state.money);
    hud.setScore(state.wins.us, state.wins.them, state.round);
    hud.hideBuy();
    hud.setBomb(null);
  }

  function update(dt, ctx) {
    const events = [];
    state.bannerLeft = Math.max(0, state.bannerLeft - dt);
    if (state.bannerLeft === 0 && state.banner) {
      state.banner = null;
      hud.setBanner(null);
    }
    if (state.phase === 'buy') {
      state.buyTimer -= dt;
      hud.setTimer(Math.ceil(state.buyTimer), true);
      if (state.buyTimer <= 0) {
        state.phase = 'live';
        hud.hideBuy();
        events.push('live');
      }
      return events;
    }
    if (state.phase === 'roundEnd') {
      roundEndLeft -= dt;
      if (roundEndLeft <= 0) {
        if (state.wins.us >= FIRST_TO || state.wins.them >= FIRST_TO) {
          state.phase = 'matchEnd';
          const won = state.wins.us > state.wins.them;
          events.push(won ? 'matchWon' : 'matchLost');
        } else {
          state.round += 1;
          startRound();
          events.push('roundStart');
        }
      }
      return events;
    }
    if (state.phase !== 'live') return events;

    // Live round.
    state.timer -= dt;
    hud.setTimer(Math.max(0, Math.ceil(state.timer)), false);
    const spike = state.spike;

    // Planting: hold E inside a site while carrying the spike.
    if (spike.state === 'carried' && ctx.playerAlive && ctx.plantKey) {
      let inSite = null;
      for (const [key, site] of Object.entries(world.sites)) {
        if (Math.hypot(ctx.playerPos.x - site.x, ctx.playerPos.z - site.z) < 3.2) inSite = key;
      }
      if (inSite) {
        spike.plant += dt / PLANT_SECONDS;
        hud.setPlant(spike.plant, world.sites[inSite].name);
        if (spike.plant >= 1) {
          spike.state = 'planted';
          spike.site = inSite;
          spike.x = world.sites[inSite].x;
          spike.z = world.sites[inSite].z;
          spike.fuse = FUSE_SECONDS;
          audio.plant();
          bots.onPlant(inSite);
          banner('SPIKE PLANTED', `Site ${inSite} ${world.sites[inSite].name} — ${FUSE_SECONDS}s to detonation`, 'warn');
          hud.setBomb({ site: inSite, fuse: spike.fuse });
          events.push('planted');
        }
      } else {
        spike.plant = Math.max(0, spike.plant - dt * 2);
        hud.setPlant(0, null);
      }
    } else {
      spike.plant = Math.max(0, spike.plant - dt * 2);
      if (spike.state === 'carried') hud.setPlant(0, null);
    }

    if (spike.state === 'planted') {
      spike.fuse -= dt;
      hud.setBomb({ site: spike.site, fuse: Math.max(0, spike.fuse) });
      const interval = spike.fuse < 10 ? 0.5 : 1;
      if (Math.floor(spike.fuse / interval) !== Math.floor((spike.fuse + dt) / interval)) audio.beep(spike.fuse < 10);
      if (spike.fuse <= 0) {
        spike.state = 'detonated';
        fx.explosion(new THREE.Vector3(spike.x, 1, spike.z));
        audio.explode();
        events.push('detonated');
        endRound(true, 'Spike detonated at Site ' + spike.site);
        return events;
      }
      if (spike.state === 'defused') {
        endRound(false, 'Spike defused by the Sentinels');
        return events;
      }
    }
    if (spike.state === 'defused') {
      endRound(false, 'Spike defused by the Sentinels');
      return events;
    }

    if (bots.aliveCount() === 0) {
      endRound(true, spike.state === 'planted' ? 'Site cleared' : 'All Sentinels eliminated');
      return events;
    }
    if (!ctx.playerAlive && !state.spectate) {
      if (spike.state === 'planted') {
        state.spectate = true;
        events.push('spectate');
      } else {
        state.deaths += 1;
        endRound(false, 'You were eliminated');
        return events;
      }
    }
    if (state.timer <= 0 && spike.state !== 'planted') {
      endRound(false, 'Time expired — the Sentinels held the yard');
      return events;
    }
    return events;
  }

  function onKill() {
    state.kills += 1;
    state.money += KILL_REWARD;
    hud.setMoney(state.money);
  }

  return {
    startMatch,
    startRound,
    update,
    buy,
    buyItems,
    onKill,
    // Test/screenshot helper: keep the round-end phase alive for N seconds
    // instead of advancing (the update loop otherwise moves on immediately
    // when roundEndLeft was never armed by endRound()).
    holdRoundEnd(seconds) { roundEndLeft = seconds; },
  };
}
