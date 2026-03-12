import { checkRealConnection } from "../../../js/network.js"



document.addEventListener('DOMContentLoaded', async () => {
  const gameModeRadios = document.querySelectorAll('input[name="gameMode"]');
  const challengeSettings = document.getElementById('challengeSettings');
  const challengeDivider = document.getElementById('challengeDivider');
  const startGameBtn = document.getElementById('startGameBtn');

  const isOnline = await checkRealConnection();

  // Handle mode selection UI
  gameModeRadios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const mode = e.target.value;
      if (mode === 'defi') {
        challengeSettings.style.display = 'block';
        challengeDivider.style.display = 'block';
      } else {
        challengeSettings.style.display = 'none';
        challengeDivider.style.display = 'none';
      }
    });
  });

  if (!isOnline) {
    console.log("off line");
    const confrontRadio = document.querySelector('input[value="confrontation"]');
    if (confrontRadio) {
      confrontRadio.disabled = true;
      confrontRadio.checked = false; // au cas où il était sélectionné 
      confrontRadio.parentElement.classList.add("disabled-mode");
    }
  }

  // Start game button
  startGameBtn.addEventListener('click', () => {
    const selectedMode = document.querySelector('input[name="gameMode"]:checked').value;

    if (selectedMode === 'confrontation') {
      const params = new URLSearchParams();
      params.set('mode', 'confrontation');
      params.set('duration', '600');
      window.location.href = `lobby.html?${params.toString()}`;
      return;
    }

    const params = new URLSearchParams();
    params.set('mode', selectedMode);

    if (selectedMode === 'defi') {
      const time = document.querySelector('input[name="challengeTime"]:checked').value;
      params.set('duration', time);
    }

    window.location.href = `game.html?${params.toString()}`;
  });
});
