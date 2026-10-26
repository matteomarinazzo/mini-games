// ─────────────────────────────────────────────
// FEEDBACK SYSTEM — Modal & Discord notification
// ─────────────────────────────────────────────
import { sendFeedbackNotification } from "./webhooks.js";
import { checkRealConnection } from "../network.js";

const LOCAL_TIME_KEY = 'mg_stat_play_time_min';
const FEEDBACK_STATUS_KEY = 'mg_feedback_status'; // 'submitted' | 'never'
const FEEDBACK_NEXT_MIN_KEY = 'mg_feedback_next_trigger_min'; // Seuil en minutes pour le prochain affichage

let isModalOpen = false;

// ─── I18N HELPER ─────────────────────────────────────────────────────────────
async function ensureI18n() {
    if (typeof window.t === 'function') return;
    try {
        const isTestEnv = window.location.pathname.includes('/perso/mini-games-plateform/');
        const base = isTestEnv ? '/perso/mini-games-plateform/' : '/';
        const lang = (localStorage.getItem("lang") || navigator.language?.split('-')[0] || "fr").toLowerCase();
        const res = await fetch(`${base}assets/lang/${lang}.json?v=1.1`).catch(() => fetch(`${base}assets/lang/fr.json?v=1.1`));
        if (res.ok) {
            const data = await res.json();
            window.t = (path) => {
                const keys = path.split('.');
                let cur = data;
                for (const k of keys) {
                    if (cur && Object.prototype.hasOwnProperty.call(cur, k)) cur = cur[k];
                    else return path;
                }
                return cur !== undefined && cur !== null ? cur : path;
            };
        }
    } catch {
        // Fallback transparent
    }
}

function tr(key, fallback = "", params = {}) {
    let text = "";
    if (typeof window.t === "function") {
        const val = window.t(key);
        if (val && val !== key) {
            text = val;
        }
    }
    if (!text) {
        text = fallback;
    }
    if (params && typeof params === "object") {
        for (const [k, v] of Object.entries(params)) {
            text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
        }
    }
    return text;
}

function getLocalTotalMinutes() {
    return parseInt(localStorage.getItem(LOCAL_TIME_KEY) || '0', 10);
}

export function shouldShowFeedbackModal() {
    const status = localStorage.getItem(FEEDBACK_STATUS_KEY);
    if (status === 'submitted' || status === 'never') return false;

    const totalMin = getLocalTotalMinutes();
    const nextTrigger = parseInt(localStorage.getItem(FEEDBACK_NEXT_MIN_KEY) || '10', 10);
    return totalMin >= nextTrigger;
}

function ensureFeedbackStyles() {
    if (document.getElementById('mg-feedback-modal-styles')) return;
    const style = document.createElement('style');
    style.id = 'mg-feedback-modal-styles';
    style.textContent = `
        .mg-feedback-overlay {
            position: fixed;
            inset: 0;
            background: rgba(5, 6, 18, 0.82);
            backdrop-filter: blur(16px);
            -webkit-backdrop-filter: blur(16px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 999999;
            opacity: 0;
            transition: opacity 0.32s cubic-bezier(0.16, 1, 0.3, 1);
            padding: 20px;
            box-sizing: border-box;
        }
        .mg-feedback-overlay.mg-show {
            opacity: 1;
        }
        .mg-feedback-card {
            position: relative;
            background: linear-gradient(165deg, rgba(28, 30, 54, 0.98) 0%, rgba(13, 14, 28, 0.99) 100%);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 28px;
            padding: 36px 34px 28px;
            max-width: 560px;
            width: 100%;
            box-shadow: 0 28px 72px rgba(0, 0, 0, 0.75), 0 0 50px rgba(102, 126, 234, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.22);
            transform: scale(0.92) translateY(24px);
            transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1);
            box-sizing: border-box;
            color: #fff;
            font-family: 'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            overflow: hidden;
        }
        .mg-feedback-overlay.mg-show .mg-feedback-card {
            transform: scale(1) translateY(0);
        }
        .mg-feedback-rim {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #f093fb, #764ba2, #667eea);
            background-size: 200% 100%;
            animation: mgRimSlide 4s linear infinite;
        }
        @keyframes mgRimSlide {
            0% { background-position: 0% 0%; }
            100% { background-position: 200% 0%; }
        }
        .mg-feedback-close {
            position: absolute;
            top: 16px;
            right: 16px;
            width: 36px;
            height: 36px;
            border: 1px solid rgba(255, 255, 255, 0.14);
            background: rgba(255, 255, 255, 0.08);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all 0.22s ease;
            color: rgba(255, 255, 255, 0.7);
            outline: none;
            z-index: 2;
        }
        .mg-feedback-close:hover {
            background: rgba(255, 255, 255, 0.2);
            color: #fff;
            transform: rotate(90deg);
            border-color: rgba(255, 255, 255, 0.3);
        }
        .mg-feedback-header {
            display: flex;
            align-items: center;
            gap: 18px;
            margin-bottom: 22px;
        }
        .mg-feedback-icon-box {
            width: 56px;
            height: 56px;
            border-radius: 18px;
            background: linear-gradient(135deg, rgba(102, 126, 234, 0.28), rgba(240, 147, 251, 0.28));
            border: 1px solid rgba(255, 255, 255, 0.22);
            display: flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
            color: #a5b4fc;
            box-shadow: 0 6px 18px rgba(102, 126, 234, 0.3);
        }
        .mg-feedback-title {
            font-size: 1.32rem;
            font-weight: 700;
            margin: 0 0 4px 0;
            color: #fff;
            letter-spacing: -0.01em;
            line-height: 1.25;
        }
        .mg-feedback-subtitle {
            font-size: 0.90rem;
            color: rgba(255, 255, 255, 0.75);
            margin: 0;
            line-height: 1.45;
        }
        /* Stars section */
        .mg-feedback-stars-section {
            background: rgba(255, 255, 255, 0.035);
            border: 1px solid rgba(255, 255, 255, 0.09);
            border-radius: 20px;
            padding: 18px 20px;
            text-align: center;
            margin-bottom: 20px;
        }
        .mg-feedback-stars-list {
            display: flex;
            justify-content: center;
            gap: 12px;
            margin-bottom: 8px;
        }
        .mg-feedback-star-btn {
            background: none;
            border: none;
            cursor: pointer;
            padding: 4px;
            outline: none;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .mg-feedback-star-svg {
            width: 36px;
            height: 36px;
            fill: rgba(255, 255, 255, 0.08);
            stroke: rgba(255, 255, 255, 0.3);
            stroke-width: 1.8;
            transition: fill 0.2s ease, stroke 0.2s ease, filter 0.2s ease, transform 0.2s ease;
        }
        .mg-feedback-star-btn.mg-active .mg-feedback-star-svg,
        .mg-feedback-star-btn.mg-hovered .mg-feedback-star-svg {
            fill: #fbbf24;
            stroke: #f59e0b;
            filter: drop-shadow(0 0 10px rgba(251, 191, 36, 0.75));
            transform: scale(1.14);
        }
        .mg-feedback-sentiment {
            font-size: 0.92rem;
            font-weight: 600;
            color: #f1f5f9;
            min-height: 1.35em;
        }
        /* Form fields */
        .mg-feedback-field {
            margin-bottom: 22px;
        }
        .mg-feedback-label {
            display: block;
            font-size: 0.90rem;
            font-weight: 600;
            color: rgba(255, 255, 255, 0.9);
            margin-bottom: 8px;
        }
        .mg-feedback-label-req {
            color: #f87171;
            margin-left: 3px;
        }
        .mg-feedback-textarea {
            width: 100%;
            min-height: 105px;
            background: rgba(255, 255, 255, 0.06);
            border: 1px solid rgba(255, 255, 255, 0.16);
            border-radius: 14px;
            padding: 14px 16px;
            color: #fff;
            font-family: inherit;
            font-size: 0.94rem;
            line-height: 1.5;
            box-sizing: border-box;
            resize: vertical;
            transition: border-color 0.2s, box-shadow 0.2s, background-color 0.2s;
            outline: none;
        }
        .mg-feedback-textarea:focus {
            border-color: #667eea;
            background: rgba(255, 255, 255, 0.09);
            box-shadow: 0 0 0 3.5px rgba(102, 126, 234, 0.28);
        }
        .mg-feedback-textarea::placeholder {
            color: rgba(255, 255, 255, 0.42);
        }
        .mg-feedback-textarea.mg-invalid {
            border-color: #f87171;
            box-shadow: 0 0 0 3px rgba(248, 113, 113, 0.25);
        }
        .mg-feedback-error {
            color: #fca5a5;
            font-size: 0.85rem;
            margin-top: 8px;
            display: none;
            align-items: center;
            gap: 6px;
        }
        .mg-feedback-error.mg-visible {
            display: flex;
            animation: mgShake 0.3s ease;
        }
        @keyframes mgShake {
            0%, 100% { transform: translateX(0); }
            20%, 60% { transform: translateX(-4px); }
            40%, 80% { transform: translateX(4px); }
        }
        /* Actions */
        .mg-feedback-actions {
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        .mg-feedback-btn-submit {
            width: 100%;
            padding: 14px 22px;
            border: none;
            border-radius: 14px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #fff;
            font-weight: 700;
            font-size: 1rem;
            cursor: pointer;
            box-shadow: 0 6px 20px rgba(102, 126, 234, 0.38);
            transition: transform 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 10px;
            font-family: inherit;
        }
        .mg-feedback-btn-submit:hover:not(:disabled) {
            transform: translateY(-2px);
            box-shadow: 0 9px 26px rgba(102, 126, 234, 0.55);
            filter: brightness(1.08);
        }
        .mg-feedback-btn-submit:disabled {
            opacity: 0.48;
            cursor: not-allowed;
            transform: none;
            box-shadow: none;
        }
        .mg-feedback-sub-actions {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            margin-top: 4px;
        }
        .mg-feedback-btn-later {
            flex: 1;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.15);
            color: #cbd5e1;
            border-radius: 12px;
            padding: 11px 16px;
            font-size: 0.88rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .mg-feedback-btn-later:hover {
            background: rgba(255, 255, 255, 0.16);
            color: #fff;
            border-color: rgba(255, 255, 255, 0.25);
        }
        .mg-feedback-btn-never {
            flex: 1;
            background: transparent;
            border: 1px solid rgba(255, 255, 255, 0.1);
            color: rgba(255, 255, 255, 0.55);
            border-radius: 12px;
            padding: 11px 16px;
            font-size: 0.86rem;
            font-weight: 500;
            cursor: pointer;
            transition: all 0.2s;
            font-family: inherit;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .mg-feedback-btn-never:hover {
            color: #f87171;
            border-color: rgba(239, 68, 68, 0.35);
            background: rgba(239, 68, 68, 0.1);
        }
        .mg-feedback-btn-icon {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            flex-shrink: 0;
        }
        .mg-feedback-spinner {
            width: 16px;
            height: 16px;
            border: 2px solid rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: mgSpin 0.7s linear infinite;
            display: inline-block;
        }
        @keyframes mgSpin {
            to { transform: rotate(360deg); }
        }
        .mg-feedback-success {
            text-align: center;
            padding: 30px 16px;
        }
        .mg-feedback-success-badge {
            width: 72px;
            height: 72px;
            border-radius: 50%;
            background: rgba(46, 204, 113, 0.15);
            border: 1.5px solid rgba(46, 204, 113, 0.35);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-bottom: 18px;
            animation: mgBounce 0.5s ease;
            box-shadow: 0 0 25px rgba(46, 204, 113, 0.3);
        }
        @keyframes mgBounce {
            0% { transform: scale(0.3); opacity: 0; }
            60% { transform: scale(1.15); opacity: 1; }
            100% { transform: scale(1); }
        }
        .mg-feedback-success-title {
            font-size: 1.35rem;
            font-weight: 700;
            color: #fff;
            margin: 0 0 10px 0;
        }
        .mg-feedback-success-desc {
            font-size: 0.95rem;
            color: rgba(255, 255, 255, 0.8);
            line-height: 1.5;
            margin: 0;
        }
    `;
    document.head.appendChild(style);
}

export function closeFeedbackModal() {
    const overlay = document.getElementById('mg-feedback-modal');
    if (!overlay) {
        isModalOpen = false;
        return;
    }
    overlay.classList.remove('mg-show');
    setTimeout(() => {
        overlay.remove();
        isModalOpen = false;
    }, 320);
}

export async function openFeedbackModal() {
    if (isModalOpen || document.getElementById('mg-feedback-modal')) return;

    // Ne pas afficher la modal si hors-ligne
    const isOnline = await checkRealConnection();
    if (!isOnline) {
        console.log("ℹ️ Feedback : connexion requise, joueur hors-ligne.");
        return;
    }

    isModalOpen = true;
    await ensureI18n();
    ensureFeedbackStyles();

    const currentTriggerMin = 10;

    const overlay = document.createElement('div');
    overlay.id = 'mg-feedback-modal';
    overlay.className = 'mg-feedback-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    // SVG Icons
    const starSvg = `
        <svg class="mg-feedback-star-svg" viewBox="0 0 24 24">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
        </svg>
    `;

    overlay.innerHTML = `
        <div class="mg-feedback-card">
            <div class="mg-feedback-rim"></div>
            <button class="mg-feedback-close" aria-label="${tr("feedback.close_aria", "Fermer")}" title="${tr("feedback.close_aria", "Fermer")}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"></line>
                    <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
            </button>

            <div class="mg-feedback-header">
                <div class="mg-feedback-icon-box">
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
                        <path d="M12 8v4"/>
                        <path d="M12 16h.01"/>
                    </svg>
                </div>
                <div>
                    <h3 class="mg-feedback-title">${tr("feedback.title", "Votre avis compte pour nous !")}</h3>
                    <p class="mg-feedback-subtitle">${tr("feedback.subtitle", "Déjà {min}+ minute(s) de jeu cumulée(s). Partagez votre expérience pour nous aider à améliorer la plateforme !", { min: currentTriggerMin })}</p>
                </div>
            </div>

            <div class="mg-feedback-stars-section">
                <div class="mg-feedback-stars-list">
                    <button type="button" class="mg-feedback-star-btn" data-value="1" aria-label="${tr("feedback.star_aria", "1 étoile", { n: 1 })}">${starSvg}</button>
                    <button type="button" class="mg-feedback-star-btn" data-value="2" aria-label="${tr("feedback.star_aria", "2 étoiles", { n: 2 })}">${starSvg}</button>
                    <button type="button" class="mg-feedback-star-btn" data-value="3" aria-label="${tr("feedback.star_aria", "3 étoiles", { n: 3 })}">${starSvg}</button>
                    <button type="button" class="mg-feedback-star-btn" data-value="4" aria-label="${tr("feedback.star_aria", "4 étoiles", { n: 4 })}">${starSvg}</button>
                    <button type="button" class="mg-feedback-star-btn" data-value="5" aria-label="${tr("feedback.star_aria", "5 étoiles", { n: 5 })}">${starSvg}</button>
                </div>
                <div class="mg-feedback-sentiment">${tr("feedback.score_default", "Choisissez une note")}</div>
            </div>

            <div class="mg-feedback-field">
                <label class="mg-feedback-label" for="mg-feedback-text">
                    ${tr("feedback.label_message", "Votre message ou suggestion")} <span class="mg-feedback-label-req">*</span>
                </label>
                <textarea id="mg-feedback-text" class="mg-feedback-textarea" placeholder="${tr("feedback.placeholder", "Dites-nous ce qui vous plaît, vos remarques ou vos idées de nouveautés...")}"></textarea>
                <div class="mg-feedback-error">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                    </svg>
                    <span>${tr("feedback.error_required", "Veuillez sélectionner une note et saisir votre message.")}</span>
                </div>
            </div>

            <div class="mg-feedback-actions">
                <button type="button" class="mg-feedback-btn-submit" disabled>
                    <span class="mg-feedback-btn-icon">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="22" y1="2" x2="11" y2="13"></line>
                            <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                        </svg>
                    </span>
                    <span>${tr("feedback.btn_submit", "Envoyer mon avis")}</span>
                </button>
                <div class="mg-feedback-sub-actions">
                    <button type="button" class="mg-feedback-btn-later" title="${tr("feedback.btn_later_title", "Rappel dans {min} minute(s) de jeu", { min: currentTriggerMin })}">
                        <span class="mg-feedback-btn-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <polyline points="12 6 12 12 16 14"></polyline>
                            </svg>
                        </span>
                        <span>${tr("feedback.btn_later", "Me le rappeler plus tard")}</span>
                    </button>
                    <button type="button" class="mg-feedback-btn-never" title="${tr("feedback.btn_never_title", "Ne plus afficher cette demande")}">
                        <span class="mg-feedback-btn-icon">
                            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                                <circle cx="12" cy="12" r="10"></circle>
                                <line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line>
                            </svg>
                        </span>
                        <span>${tr("feedback.btn_never", "Ne plus me demander")}</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
        overlay.classList.add('mg-show');
    });

    let selectedRating = 0;
    const sentiments = {
        0: tr("feedback.score_default", "Choisissez une note"),
        1: tr("feedback.score_1", "1/5 — À améliorer 😕"),
        2: tr("feedback.score_2", "2/5 — Passable 😐"),
        3: tr("feedback.score_3", "3/5 — Bien 🙂"),
        4: tr("feedback.score_4", "4/5 — Très bien ! 😄"),
        5: tr("feedback.score_5", "5/5 — Chef-d'œuvre ! 🤩")
    };

    const starBtns = overlay.querySelectorAll('.mg-feedback-star-btn');
    const sentimentEl = overlay.querySelector('.mg-feedback-sentiment');
    const textarea = overlay.querySelector('#mg-feedback-text');
    const errorEl = overlay.querySelector('.mg-feedback-error');
    const submitBtn = overlay.querySelector('.mg-feedback-btn-submit');
    const laterBtn = overlay.querySelector('.mg-feedback-btn-later');
    const neverBtn = overlay.querySelector('.mg-feedback-btn-never');
    const closeBtn = overlay.querySelector('.mg-feedback-close');

    function updateStarsDisplay(rating) {
        starBtns.forEach(btn => {
            const val = parseInt(btn.dataset.value, 10);
            if (val <= rating) {
                btn.classList.add('mg-active');
            } else {
                btn.classList.remove('mg-active');
            }
        });
        sentimentEl.textContent = sentiments[rating] || sentiments[0];
    }

    function checkFormValidity() {
        const hasRating = selectedRating > 0;
        const hasText = textarea.value.trim().length > 0;
        submitBtn.disabled = !(hasRating && hasText);
        if (hasRating && hasText) {
            errorEl.classList.remove('mg-visible');
            textarea.classList.remove('mg-invalid');
        }
    }

    starBtns.forEach(btn => {
        const val = parseInt(btn.dataset.value, 10);
        btn.addEventListener('mouseenter', () => {
            starBtns.forEach(b => {
                const bVal = parseInt(b.dataset.value, 10);
                b.classList.toggle('mg-hovered', bVal <= val);
            });
            sentimentEl.textContent = sentiments[val];
        });

        btn.addEventListener('mouseleave', () => {
            starBtns.forEach(b => b.classList.remove('mg-hovered'));
            sentimentEl.textContent = sentiments[selectedRating] || sentiments[0];
        });

        btn.addEventListener('click', () => {
            selectedRating = val;
            updateStarsDisplay(selectedRating);
            checkFormValidity();
        });
    });

    textarea.addEventListener('input', () => {
        checkFormValidity();
    });

    // Bouton de fermeture (✕) -> reporte de 10 min et envoie le webhook
    closeBtn.addEventListener('click', () => {
        const nextMin = getLocalTotalMinutes() + 10;
        localStorage.setItem(FEEDBACK_NEXT_MIN_KEY, nextMin);
        sendFeedbackNotification({ action: 'remind_later' });
        closeFeedbackModal();
    });

    // Bouton "Me le rappeler plus tard"
    laterBtn.addEventListener('click', async () => {
        laterBtn.disabled = true;
        laterBtn.innerHTML = `<span>${tr("feedback.saved", "Enregistré...")}</span>`;
        const nextMin = getLocalTotalMinutes() + 10;
        localStorage.setItem(FEEDBACK_NEXT_MIN_KEY, nextMin);
        await sendFeedbackNotification({ action: 'remind_later' });
        closeFeedbackModal();
    });

    // Bouton "Ne plus jamais me demander"
    neverBtn.addEventListener('click', async () => {
        neverBtn.disabled = true;
        neverBtn.innerHTML = `<span>${tr("feedback.saved", "Enregistré...")}</span>`;
        localStorage.setItem(FEEDBACK_STATUS_KEY, 'never');
        await sendFeedbackNotification({ action: 'never_ask' });
        closeFeedbackModal();
    });

    // Bouton "Envoyer mon avis"
    submitBtn.addEventListener('click', async () => {
        const msg = textarea.value.trim();
        if (selectedRating === 0 || msg.length === 0) {
            errorEl.classList.add('mg-visible');
            if (msg.length === 0) textarea.classList.add('mg-invalid');
            return;
        }

        submitBtn.disabled = true;
        laterBtn.disabled = true;
        neverBtn.disabled = true;
        textarea.disabled = true;
        submitBtn.innerHTML = `<span class="mg-feedback-spinner"></span> <span>${tr("feedback.btn_submitting", "Envoi en cours...")}</span>`;

        const success = await sendFeedbackNotification({
            action: 'feedback',
            rating: selectedRating,
            message: msg
        });

        if (!success) {
            submitBtn.disabled = false;
            laterBtn.disabled = false;
            neverBtn.disabled = false;
            textarea.disabled = false;
            submitBtn.innerHTML = `
                <span class="mg-feedback-btn-icon">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                        <line x1="22" y1="2" x2="11" y2="13"></line>
                        <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
                    </svg>
                </span>
                <span>${tr("feedback.btn_submit", "Envoyer mon avis")}</span>
            `;
            errorEl.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                <span>Connexion perdue. Veuillez vérifier votre connexion internet et réessayer.</span>
            `;
            errorEl.classList.add('mg-visible');
            return;
        }

        localStorage.setItem(FEEDBACK_STATUS_KEY, 'submitted');

        const card = overlay.querySelector('.mg-feedback-card');
        card.innerHTML = `
            <div class="mg-feedback-rim"></div>
            <div class="mg-feedback-success">
                <div class="mg-feedback-success-badge">
                    <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#2ecc71" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                    </svg>
                </div>
                <h3 class="mg-feedback-success-title">${tr("feedback.success_title", "Merci pour votre retour !")}</h3>
                <p class="mg-feedback-success-desc">${tr("feedback.success_desc", "Votre avis et vos suggestions ont bien été envoyés. Grâce à vous, la plateforme s'améliore chaque jour !")}</p>
            </div>
        `;

        setTimeout(() => {
            closeFeedbackModal();
        }, 1800);
    });
}

export async function checkFeedbackTrigger() {
    if (typeof document === 'undefined') return;
    if (document.hidden) return;
    if (isModalOpen || document.getElementById('mg-feedback-modal')) return;
    if (!document.body) {
        document.addEventListener('DOMContentLoaded', checkFeedbackTrigger, { once: true });
        return;
    }
    if (!shouldShowFeedbackModal()) return;

    // Ne pas afficher la modal si hors-ligne
    const isOnline = await checkRealConnection();
    if (!isOnline) return;

    openFeedbackModal();
}

// Helpers de test exposés sur window
if (typeof window !== 'undefined') {
    window.__openFeedbackModal = openFeedbackModal;
    window.__resetFeedbackState = () => {
        localStorage.removeItem(FEEDBACK_STATUS_KEY);
        localStorage.removeItem(FEEDBACK_NEXT_MIN_KEY);
        console.log("Feedback state reset");
    };
}
