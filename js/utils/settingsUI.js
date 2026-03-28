import {
    getMusicEnabled,
    getSoundEnabled,
    toggleSound,
    toggleCasinoMusic,
    toggleFunfairMusic
} from './audio.js';

export function initSettingsUI(context = 'casino') {
    // Inject HTML dynamically
    const container = document.createElement('div');
    container.id = 'floating-menu-settings';
    container.className = 'floating-settings-container';
    container.innerHTML = `
        <div class="settings-buttons">
            <button id="mainMusicToggle" class="btn-floating primary" title="Musique (M)">
                <span class="icon icon-cog">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="12" cy="12" r="3"></circle>
                        <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                    </svg>
                </span>
                <span class="icon icon-music" style="display:none;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M9 18V5l12-2v13"></path><circle cx="6" cy="18" r="3"></circle><circle cx="18" cy="16" r="3"></circle>
                    </svg>
                </span>
            </button>
            <button id="mainSoundToggle" class="btn-floating secondary" title="Son (S)">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
            </button>
        </div>
    `;
    document.body.appendChild(container);

    // CSS dynamique si manquant
    if (!document.getElementById('dynamic-settings-css')) {
        const style = document.createElement('style');
        style.id = 'dynamic-settings-css';
        style.textContent = `
            .floating-settings-container {
               position: fixed;
               bottom: 30px;
               left: 30px;
               z-index: 2000;
               transition: opacity 0.5s ease, transform 0.5s ease;
            }
            .floating-settings-container.hidden {
               opacity: 0;
               pointer-events: none;
               transform: translateY(10px);
            }
            .settings-buttons {
               display: flex;
               gap: 12px;
               align-items: center;
            }
            .btn-floating {
               width: 56px;
               height: 56px;
               border-radius: 50%;
               background: rgba(255, 255, 255, 0.08);
               backdrop-filter: blur(12px);
               border: 1px solid rgba(255, 255, 255, 0.15);
               color: white;
               cursor: pointer;
               display: flex;
               align-items: center;
               justify-content: center;
               transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
               box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
               opacity: 0.6;
            }
            .btn-floating.secondary {
               width: 0;
               height: 0;
               opacity: 0;
               overflow: hidden;
               margin-left: -12px;
               pointer-events: none;
            }
            .floating-settings-container:hover .btn-floating.secondary {
               width: 56px;
               height: 56px;
               opacity: 0.6;
               margin-left: 0;
               pointer-events: auto;
            }
            .btn-floating:hover {
               background: rgba(255, 255, 255, 0.15);
               transform: scale(1.1);
               opacity: 1 !important;
            }
            .btn-floating.active {
               background: rgba(56, 189, 248, 0.2);
               border-color: rgba(56, 189, 248, 0.5);
               color: #38bdf8;
               opacity: 1 !important;
               box-shadow: 0 0 20px rgba(56, 189, 248, 0.3);
            }
        `;
        document.head.appendChild(style);
    }

    const musicBtn = document.getElementById('mainMusicToggle');
    const soundBtn = document.getElementById('mainSoundToggle');
    const iconCog = musicBtn.querySelector('.icon-cog');
    const iconMusic = musicBtn.querySelector('.icon-music');

    let visibilityTimeout = null;

    const showFloatingBtn = () => {
        container.classList.remove('hidden');
        if (visibilityTimeout) clearTimeout(visibilityTimeout);
        visibilityTimeout = setTimeout(() => {
            container.classList.add('hidden');
        }, 10000);
    };

    // Reveiller sur interaction
    document.addEventListener('mousemove', showFloatingBtn);
    document.addEventListener('mousedown', showFloatingBtn);
    document.addEventListener('keydown', showFloatingBtn);
    document.addEventListener('touchstart', showFloatingBtn);

    const updateParamBtnState = () => {
        const isHovered = container.matches(':hover');
        soundBtn.classList.toggle('active', getSoundEnabled());

        if (isHovered) {
            musicBtn.classList.toggle('active', getMusicEnabled());
        } else {
            musicBtn.classList.toggle('active', getMusicEnabled() || getSoundEnabled());
        }
    };

    container.addEventListener('mouseenter', () => {
        iconCog.style.display = 'none';
        iconMusic.style.display = 'flex';
        updateParamBtnState();
    });

    container.addEventListener('mouseleave', () => {
        iconCog.style.display = 'flex';
        iconMusic.style.display = 'none';
        updateParamBtnState();
    });

    musicBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (context === 'casino') toggleCasinoMusic();
        else toggleFunfairMusic();
        updateParamBtnState();
    });

    soundBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleSound();
        updateParamBtnState();
    });

    // Toggle on keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        if (e.key.toLowerCase() === 'm') {
            if (context === 'casino') toggleCasinoMusic();
            else toggleFunfairMusic();
            updateParamBtnState();
        }
        if (e.key.toLowerCase() === 's') {
            toggleSound();
            updateParamBtnState();
        }
    });

    updateParamBtnState();
    showFloatingBtn();
}
