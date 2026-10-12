if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js', {
                scope: './',
                updateViaCache: 'none'
            });

            console.log('✅ SW enregistré ! Scope:', registration.scope);

            function showToast(message, type, duration = 2500) {
                const toast = document.createElement('div');
                toast.className = 'toast';
                if (type === 'success') {
                    toast.classList.add('toast-success');
                }
                toast.setAttribute('role', 'status');
                toast.textContent = message;
                document.body.appendChild(toast);

                setTimeout(() => toast.remove(), duration);
            }

            // Après le rechargement, afficher le message de confirmation
            if (sessionStorage.getItem('sw_update_done') === 'true') {
                sessionStorage.removeItem('sw_update_done');
                showToast('Mise à jour effectuée', 'success', 2500);
            }

            // Vérifier les mises à jour toutes les 30 minutes
            setInterval(() => {
                registration.update();
                console.log('[SW] Vérification de mise à jour...');
            }, 30 * 60 * 1000);

            // Vérifier aussi au retour sur l’onglet
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    registration.update();
                }
            });

            // Nouveau SW installé : lui demander de s’activer
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (
                        newWorker.state === 'installed' &&
                        navigator.serviceWorker.controller
                    ) {
                        console.log('[SW] 🆕 Nouvelle version installée, activation...');
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            // Nouveau SW actif : afficher le toast, puis recharger
            let refreshing = false;

            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;

                console.log('[SW] 🔁 Nouvelle version active.');

                sessionStorage.setItem('sw_update_done', 'true');
                showToast('Une mise à jour est en cours…', 1800);

                setTimeout(() => {
                    window.location.reload();
                }, 1800);
            });

        } catch (error) {
            console.error('❌ Erreur d’enregistrement du SW:', error);
        }
    });
}