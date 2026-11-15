// The DOM HUD: crosshair, hit marker, ammo, health, money, timer, score, kill
// feed, spike status and the overlays (menu, pause, buy, match end). It never
// touches the simulation; main.js and rounds.js push numbers in and read the
// play and buy callbacks out. Every setter caches its last value.
const COPY = {
  start: { title: 'DUSTLINE', copy: 'Foundry Yard — Vanguard versus five Sentinels. Plant the spike or clear the yard.', action: 'Click to play' },
  paused: { title: 'DUSTLINE', copy: 'Paused. Click to resume.', action: 'Click to resume' },
  matchWon: { title: 'YARD TAKEN', copy: 'Vanguard wins the match.', action: 'Play again' },
  matchLost: { title: 'YARD HELD', copy: 'The Sentinels held the yard.', action: 'Play again' },
};

export function createHud() {
  const $ = (id) => document.getElementById(id);
  const overlay = $('overlay');
  const title = $('overlay-title');
  const copy = $('overlay-copy');
  const play = $('play');
  const crosshair = $('crosshair');
  const hitmarker = $('hitmarker');
  const ammoMag = $('ammo-mag');
  const ammoReserve = $('ammo-reserve');
  const weaponName = $('weapon-name');
  const moneyValue = $('money-value');
  const healthFill = $('health-fill');
  const healthValue = $('health-value');
  const armorFill = $('armor-fill');
  const timerValue = $('timer-value');
  const timerLabel = $('timer-label');
  const scoreValue = $('score-value');
  const aliveValue = $('alive-value');
  const killfeed = $('killfeed');
  const bomb = $('bomb');
  const bombText = $('bomb-text');
  const plantBar = $('plant-bar');
  const plantFill = $('plant-fill');
  const plantLabel = $('plant-label');
  const bannerEl = $('banner');
  const bannerTitle = $('banner-title');
  const bannerSub = $('banner-sub');
  const vignette = $('damage-vignette');
  const damageDir = $('damage-dir');
  const buyPanel = $('buy');
  const buyList = $('buy-list');
  const buyMoney = $('buy-money');
  let hitTimer = 0;
  let vignetteTimer = 0;
  let last = {};

  function setText(el, key, value) {
    if (last[key] === value) return;
    last[key] = value;
    el.textContent = value;
  }

  return {
    setAmmo(mag, reserve) {
      setText(ammoMag, 'mag', String(mag));
      setText(ammoReserve, 'res', `/ ${reserve}`);
      $('ammo').classList.toggle('empty', mag === 0);
    },
    setWeapon(name) { setText(weaponName, 'weapon', name); },
    setMoney(n) {
      setText(moneyValue, 'money', `$${n}`);
      setText(buyMoney, 'buyMoney', `$${n}`);
    },
    setHealth(hp, armor) {
      const h = Math.max(0, Math.round(hp));
      if (last.hp !== h) { last.hp = h; healthFill.style.width = `${h}%`; setText(healthValue, 'hp', String(h)); }
      const a = Math.max(0, Math.round(armor));
      if (last.armor !== a) { last.armor = a; armorFill.style.width = `${Math.min(100, a * 2)}%`; }
      $('health').classList.toggle('low', h <= 30);
    },
    setTimer(seconds, isBuy) {
      const m = Math.floor(seconds / 60);
      const s = String(seconds % 60).padStart(2, '0');
      setText(timerValue, 'timer', `${m}:${s}`);
      setText(timerLabel, 'timerLabel', isBuy ? 'BUY' : 'ROUND');
      $('timer').classList.toggle('buy', isBuy);
    },
    setScore(us, them, round) {
      setText(scoreValue, 'score', `VANGUARD ${us} — ${them} SENTINELS · ROUND ${round}`);
    },
    setAlive(botsAlive) {
      setText(aliveValue, 'alive', `SENTINELS LEFT: ${botsAlive}`);
    },
    setSpread(px) {
      crosshair.style.setProperty('--gap', `${px.toFixed(1)}px`);
    },
    setBomb(info) {
      if (!info) { bomb.hidden = true; return; }
      bomb.hidden = false;
      setText(bombText, 'bomb', `SPIKE SITE ${info.site} — ${Math.ceil(info.fuse)}s`);
    },
    setPlant(progress, siteName) {
      if (!progress || progress <= 0) { plantBar.hidden = true; return; }
      plantBar.hidden = false;
      plantFill.style.width = `${Math.round(progress * 100)}%`;
      setText(plantLabel, 'plant', `PLANTING SPIKE — SITE ${siteName}`);
    },
    setBanner(title, sub, tone) {
      if (!title) { bannerEl.hidden = true; return; }
      bannerEl.hidden = false;
      bannerEl.dataset.tone = tone || '';
      setText(bannerTitle, 'bannerTitle', title);
      setText(bannerSub, 'bannerSub', sub || '');
    },
    hitMarker(killed, holdMs = 90) {
      hitmarker.classList.add('on');
      hitmarker.classList.toggle('kill', killed);
      clearTimeout(hitTimer);
      hitTimer = setTimeout(() => hitmarker.classList.remove('on', 'kill'), holdMs);
    },
    damageFrom(angleDeg) {
      vignette.classList.add('on');
      damageDir.style.transform = `rotate(${angleDeg}deg)`;
      damageDir.classList.add('on');
      clearTimeout(vignetteTimer);
      vignetteTimer = setTimeout(() => {
        vignette.classList.remove('on');
        damageDir.classList.remove('on');
      }, 350);
    },
    killfeed(text) {
      const line = document.createElement('div');
      line.textContent = text;
      killfeed.prepend(line);
      while (killfeed.children.length > 4) killfeed.lastChild.remove();
      setTimeout(() => line.remove(), 6000);
    },
    showBuy(items) {
      buyPanel.hidden = false;
      buyList.innerHTML = '';
      items.forEach((item, i) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'buy-item';
        button.disabled = item.owned || false;
        button.innerHTML = `<span class="buy-key">${i + 1}</span><span class="buy-name">${item.name}</span><span class="buy-price">${item.owned ? 'OWNED' : '$' + item.price}</span>`;
        button.addEventListener('click', () => this.onBuyItem(item.id));
        buyList.appendChild(button);
      });
    },
    hideBuy() { buyPanel.hidden = true; },
    onBuyItem: () => {},
    onBuy(handler) { this.onBuyItem = handler; },
    showOverlay(mode, score) {
      const text = COPY[mode];
      if (!text) return;
      title.textContent = text.title;
      copy.textContent = mode === 'matchWon' || mode === 'matchLost' ? `${text.copy} Final score ${score}.` : text.copy;
      play.textContent = text.action;
      overlay.hidden = false;
      play.focus();
    },
    hideOverlay() { overlay.hidden = true; },
    onPlay(handler) { play.addEventListener('click', handler); },
  };
}
