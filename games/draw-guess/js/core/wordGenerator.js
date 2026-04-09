import { getSecret } from '../../../../js/utils/secretManager.js';



const recentWords = []; // historique de la session

const FALLBACK_WORDS = [
    "un chat danseur",
    "un poisson cycliste",
    "une vache acrobate",
    "un escargot sprinteur",
    "une poule nageuse",
    "un canard grimpeur",
    "une souris boxeuse",
    "un éléphant voltigeur",
    "un serpent skateur",
    "une girafe plongeuse",
    "un cochon équilibriste",
    "une tortue cascadeuse",
    "un lapin aviateur",
    "un singe plombier",
    "un ours patineur",
    "une chauve-souris aveugle",
    "un mouton coiffeur",
    "un requin jardinière",
    "un pingouin pompier",
    "un koala plombier",
    "un zèbre tatoueur",
    "un lion végétarien",
    "un hippopotame ballerine",
    "un rhinocéros coiffeur",
    "un caméléon météo",
    "un hérisson électricien",
    "un flamant rose boulanger",
    "un ours polaire surfeur",
    "un kangourou facteur",
    "un paon éboueur"
];

export async function generateWord() {
    try {
        const GROQ_API_KEY = await getSecret('GROQ_API_KEY');
        const GROQ_URL = await getSecret('GROQ_URL');

        const exclusions = recentWords.length > 0
            ? `\nEXPRESSIONS DÉJÀ UTILISÉES À ÉVITER : ${recentWords.join(', ')}.`
            : '';

        const response = await fetch(GROQ_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.3-70b-versatile',
                messages: [{
                    role: 'system',
                    content: `Tu génères des expressions ABSURDES et ILLOGIQUES pour Pictionary.

FORMAT OBLIGATOIRE : "un/une [animal] [métier/action insolite]"
Exemples : "un chat danseur", "un poisson cycliste", "une vache acrobate"

RÈGLES :
- 3 mots maximum (un/une + nom + action/métier)
- Minuscules, sans ponctuation
- Pas de "qui", "que", "mange", "fait", "va", "est"
- Tu peux utiliser des animaux, des objets, qui concepts, etc
- Varie, ne fait pas que des animaux
- Le lien entre l'animal, l'objet, l'humain ou le concept (métiers, etc), etc et l'action doit être ABSURDE ou ILLOGIQUE

EXEMPLES RÉUSSIS (simples mais absurdes) :
- un chat nageur
- un cactus patineur
- une poule skieuse  
- un escargot cascadeur
- un éléphant équilibriste
- un serpent aviateur
- un pingouin pompier
- une souris bodybuildeuse
- un requin végétarien
- un koala plombier
- un lion végétarien

CE QU'IL FAUT ÉVITER :
❌ Les descriptions réalistes (un chat malade, un chien fatigué)
❌ Les couleurs (un chat gris)
❌ Les actions normales (un chien qui dort)

SOIS SIMPLE MAIS ABSURDE !${exclusions}`
                }, {
                    role: 'user',
                    content: 'Génère UNE expression absurde et illogique. UNIQUEMENT l\'expression, rien d\'autre.'
                }],
                max_tokens: 15,
                temperature: 1.2,
                stream: false
            })
        });

        if (!response.ok) throw new Error(`Groq error ${response.status}`);

        const data = await response.json();
        let text = data?.choices?.[0]?.message?.content?.trim()
            .replace(/^["'«»]|["'«»]$/g, '')
            .toLowerCase();

        const forbidden = ['qui', 'que', 'mange', 'fait', 'va', 'est'];
        if (forbidden.some(w => text.split(' ').includes(w))) {
            throw new Error('Mot interdit détecté');
        }

        // Vérification du format (doit commencer par un/une et avoir 2-3 mots)
        const words = text.split(' ');
        if (!text.startsWith('un ') && !text.startsWith('une ')) {
            throw new Error('Doit commencer par un/une');
        }

        if (words.length < 2 || words.length > 3) {
            throw new Error('Format invalide (2-3 mots requis)');
        }

        if (!text || text.length < 5 || text.length > 30) throw new Error('Réponse invalide');

        // Sauvegarde dans l'historique (max 20 pour pas surcharger le prompt)
        recentWords.push(text);
        if (recentWords.length > 20) recentWords.shift();

        return text;

    } catch (err) {
        console.warn('Groq indisponible, fallback :', err.message);
        // Fallback sans répétition avec des expressions absurdes
        const available = FALLBACK_WORDS.filter(w => !recentWords.includes(w));
        const pool = available.length > 0 ? available : FALLBACK_WORDS;
        const word = pool[Math.floor(Math.random() * pool.length)];
        recentWords.push(word);
        if (recentWords.length > 20) recentWords.shift();
        return word;
    }
}