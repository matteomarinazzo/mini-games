const KEY_XP = 'mg_xp_total';
const XP_PER_LEVEL = 250;

export function getTotalXP() {
    return parseInt(localStorage.getItem(KEY_XP) || '0', 10);
}

export function getLevel() {
    return Math.floor(getTotalXP() / XP_PER_LEVEL) + 1;
}

export function getXPInLevel() {
    return getTotalXP() % XP_PER_LEVEL;
}

export function getXPToNextLevel() {
    return XP_PER_LEVEL - getXPInLevel();
}

export function getLevelProgress() {
    return getXPInLevel() / XP_PER_LEVEL;
}

export function addXP(amount) {
    if (!amount || amount <= 0) return { leveledUp: false };
    const before = getLevel();
    const newTotal = getTotalXP() + amount;
    localStorage.setItem(KEY_XP, String(newTotal));
    const after = Math.floor(newTotal / XP_PER_LEVEL) + 1;
    const leveledUp = after > before;

    if (leveledUp) {
        _showLevelUpToast(after);
    }

    // Signaler la mise à jour pour que le profil (si ouvert) se rafraîchisse
    window.dispatchEvent(new CustomEvent('mg:xp_updated', { detail: { amount, newTotal } }));

    return { leveledUp, newLevel: after, oldLevel: before };
}

function _showLevelUpToast(newLevel) {
    // Helper pour les traductions avec fallback
    const _t = (path, fallback) => {
        if (!window.t) return fallback;
        const res = window.t(path);
        return (res === path || !res) ? fallback : res;
    };

    const title = _t('profile.level_up_title', "Niveau atteint !");
    const label = _t('profile.level', "Niveau");

    const toast = document.createElement('div');
    Object.assign(toast.style, {
        position: 'fixed', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%) scale(0.5)',
        zIndex: '10000',
        background: 'linear-gradient(135deg,#ffd54f,#ff8a00)',
        color: '#1a1a2e', borderRadius: '20px',
        padding: '24px 36px',
        boxShadow: '0 20px 60px rgba(255,200,0,.5)',
        fontFamily: 'inherit', textAlign: 'center',
        transition: 'transform .5s cubic-bezier(.16,1.5,.3,1), opacity .3s',
        opacity: '0',
    });
    toast.innerHTML = `
    <div style="margin-bottom:12px; display:flex; justify-content:center; align-items:center;">
        <svg width="56" height="56" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <!-- Étoiles décoratives arrière -->
            <path d="M10 14L11 11L12 14L15 15L12 16L11 19L10 16L7 15Z" fill="#fff" opacity="0.6"/>
            <path d="M54 14L55 11L56 14L59 15L56 16L55 19L54 16L51 15Z" fill="#fff" opacity="0.6"/>
            <circle cx="8" cy="32" r="1.5" fill="#fff" opacity="0.5"/>
            <circle cx="56" cy="32" r="1.5" fill="#fff" opacity="0.5"/>
            
            <!-- Anses du trophée -->
            <path d="M16 22C12 22 10 24 10 28C10 32 13 34 17 34" 
                  stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            <path d="M48 22C52 22 54 24 54 28C54 32 51 34 47 34" 
                  stroke="#fff" stroke-width="2.5" stroke-linecap="round" fill="none"/>
            
            <!-- Coupe principale -->
            <path d="M16 16H48V30C48 38 42 44 32 44C22 44 16 38 16 30V16Z" 
                  fill="#fff"/>
            
            <!-- Reflet sur la coupe -->
            <path d="M20 18H24V28C24 32 22 34 20 34V18Z" 
                  fill="#fff" opacity="0.6"/>
            
            <!-- Étoile centrale -->
            <path d="M32 22L34 27L39 27.5L35.5 31L36.5 36L32 33.5L27.5 36L28.5 31L25 27.5L30 27Z" 
                  fill="#ff8a00"/>
            
            <!-- Tige du trophée -->
            <rect x="29" y="44" width="6" height="6" fill="#fff"/>
            
            <!-- Base du trophée -->
            <path d="M22 50H42L40 56H24L22 50Z" fill="#fff"/>
            <rect x="20" y="55" width="24" height="3" rx="1" fill="#fff"/>
        </svg>
    </div>
    <div style="font-size:.7rem;font-weight:700;letter-spacing:3px;text-transform:uppercase;opacity:.85;margin-bottom:6px;color:#fff">${title}</div>
    <div style="font-size:2.4rem;font-weight:900;line-height:1;color:#fff;text-shadow:0 2px 8px rgba(0,0,0,0.15)">${label} ${newLevel}</div>
`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, -50%) scale(1)';
    });
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translate(-50%, -50%) scale(0.8)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
