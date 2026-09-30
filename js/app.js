if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
        try {
            // 🔑 updateViaCache: 'none' => le navigateur n'utilise jamais son cache HTTP pour sw.js
            const registration = await navigator.serviceWorker.register('./sw.js', {
                scope: './',
                updateViaCache: 'none'
            });

            console.log('✅ SW enregistré ! Scope:', registration.scope);

            // 🔄 Vérifier les mises à jour toutes les 30 minutes
            setInterval(() => {
                registration.update();
                console.log('[SW] Vérification de mise à jour...');
            }, 30 * 60 * 1000);

            // 🔄 Vérifier la mise à jour quand l'utilisateur revient sur l'onglet
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    registration.update();
                }
            });

            // 🆕 Quand un nouveau SW est trouvé et installé, on lui dit de s'activer tout de suite
            registration.addEventListener('updatefound', () => {
                const newWorker = registration.installing;
                if (!newWorker) return;

                newWorker.addEventListener('statechange', () => {
                    if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                        console.log('[SW] 🆕 Nouvelle version installée, activation...');
                        newWorker.postMessage({ type: 'SKIP_WAITING' });
                    }
                });
            });

            // 🔁 Quand le nouveau SW prend le contrôle, on recharge la page automatiquement
            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (refreshing) return;
                refreshing = true;
                console.log('[SW] 🔁 Nouvelle version active, rechargement...');
                window.location.reload();
            });

        } catch (error) {
            console.error('❌ Erreur d\'enregistrement du SW:', error);
        }
    });
}
